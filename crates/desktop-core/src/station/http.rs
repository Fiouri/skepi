//! The HTTP/1.1 subset of the P2P protocol (as `Http.kt`): one request per connection
//! (`Connection: close`), GET only, headers at most 8 KiB, lower-cased header names.

use std::collections::HashMap;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const MAX_HEADER_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
}

pub async fn read_request<R: AsyncRead + Unpin>(input: &mut R) -> std::io::Result<Request> {
    let mut buf = Vec::with_capacity(512);
    let mut byte = [0u8; 1];
    loop {
        let n = input.read(&mut byte).await?;
        if n == 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "connection closed before the end of the headers"));
        }
        buf.push(byte[0]);
        if buf.len() > MAX_HEADER_BYTES {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "headers too large"));
        }
        if buf.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    parse_head(&buf)
}

pub fn parse_head(raw: &[u8]) -> std::io::Result<Request> {
    // ISO-8859-1: every byte is one char (as Kotlin's readHead).
    let text: String = raw.iter().map(|&b| b as char).collect();
    let mut lines = text.split("\r\n").filter(|l| !l.is_empty());
    let first = lines.next().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "empty request"))?;
    let parts: Vec<&str> = first.split(' ').collect();
    if parts.len() != 3 || !parts[2].starts_with("HTTP/1.") {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "malformed request line"));
    }
    let mut headers = HashMap::new();
    for line in lines {
        if let Some(i) = line.find(':')
            && i > 0
        {
            headers.insert(line[..i].trim().to_ascii_lowercase(), line[i + 1..].trim().to_owned());
        }
    }
    Ok(Request { method: parts[0].to_owned(), path: parts[1].to_owned(), headers })
}

pub async fn write_head<W: AsyncWrite + Unpin>(out: &mut W, status: u16, reason: &str, headers: &[(&str, String)]) -> std::io::Result<()> {
    let mut s = format!("HTTP/1.1 {status} {reason}\r\n");
    for (k, v) in headers {
        s.push_str(k);
        s.push_str(": ");
        s.push_str(v);
        s.push_str("\r\n");
    }
    s.push_str("Connection: close\r\n\r\n");
    out.write_all(s.as_bytes()).await
}

pub async fn plain<W: AsyncWrite + Unpin>(out: &mut W, status: u16, reason: &str) -> std::io::Result<u16> {
    let body = reason.as_bytes();
    write_head(out, status, reason, &[("Content-Type", "text/plain; charset=utf-8".into()), ("Content-Length", body.len().to_string())]).await?;
    out.write_all(body).await?;
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_request_line_and_headers() {
        let r = parse_head(b"GET /pack/x HTTP/1.1\r\nHost: 10.0.0.2:4000\r\nAuthorization: Bearer abc\r\nRange: bytes=0-9\r\n\r\n").expect("parse");
        assert_eq!(r.method, "GET");
        assert_eq!(r.path, "/pack/x");
        assert_eq!(r.headers.get("authorization").map(String::as_str), Some("Bearer abc"));
        assert!(parse_head(b"GET /x\r\n\r\n").is_err());
        assert!(parse_head(b"GET /x SPDY/3\r\n\r\n").is_err());
    }

    #[tokio::test]
    async fn refuses_oversized_headers() {
        let big = format!("GET / HTTP/1.1\r\nX: {}\r\n\r\n", "a".repeat(MAX_HEADER_BYTES));
        let mut input = big.as_bytes();
        assert!(read_request(&mut input).await.is_err());
    }
}
