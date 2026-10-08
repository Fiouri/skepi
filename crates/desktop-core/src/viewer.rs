//! The sealed article viewer's `zim://` protocol (desktop counterpart of `ZimSchemeHandler.kt`).
//! WebView2 serves custom schemes as `http://zim.localhost/<archiveId>/<path>`, so the CSP names
//! `'self'` (the zim origin) where Android names `zim:`. Every response, 403 and 404 included,
//! carries the CSP and the other security headers; anything that is not a valid in-archive path is
//! refused and logged. The viewer webview itself has no IPC capability and no network (see
//! apps/desktop/src-tauri/src/viewer.rs).

use percent_encoding::percent_decode_str;
use regex::Regex;
use std::sync::LazyLock;

/// Desktop CSP: no script, no connections, no frames, no forms; `sandbox` (without `allow-scripts`)
/// also disables scripts, plugins, popups and top-level navigation even if a pack's HTML asks.
pub const CSP: &str = "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox";

pub const SECURITY_HEADERS: &[(&str, &str)] = &[
    ("Content-Security-Policy", CSP),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
    ("Cache-Control", "no-store"),
    ("Cross-Origin-Resource-Policy", "same-origin"),
];

/// Blackout theme (same CSS as Android).
pub const DARK_CSS: &str = "html,body{background:#000!important;color:#e5e7eb!important}*{background-color:transparent!important;color:inherit!important;border-color:#525252!important}a,a:visited{color:#93c5fd!important}img,video{opacity:.8}";

static HEAD_OPEN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<head(\s[^>]*)?>").expect("regex"));
static ARCHIVE_ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9a-fA-F-]{8,64}$").expect("regex"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub archive_id: String,
    pub path: String,
}

fn is_dot_segment(s: &str) -> bool {
    s == "." || s == ".."
}

/// Parses the path part of a viewer URL (`/<archiveId>/<percent-encoded ZIM path>`). ZIM paths are
/// flat keys: NULs and any dot segment (raw, percent-encoded, double-encoded or backslash
/// separated) are refused, like on Android.
pub fn parse_path(raw: &str) -> Option<Target> {
    let rest = raw.strip_prefix('/')?;
    let (archive, path_enc) = rest.split_once('/')?;
    if !ARCHIVE_ID.is_match(archive) || path_enc.is_empty() {
        return None;
    }
    let path = percent_decode_str(path_enc).decode_utf8().ok()?.into_owned();
    if path.is_empty() || path.contains('\0') {
        return None;
    }
    for seg in path.split(['/', '\\']) {
        if is_dot_segment(seg) {
            return None;
        }
        let once = percent_decode_str(seg).decode_utf8_lossy();
        if is_dot_segment(&once) || is_dot_segment(&percent_decode_str(&once).decode_utf8_lossy()) {
            return None;
        }
    }
    Some(Target { archive_id: archive.to_ascii_lowercase(), path })
}

/// Splits `text/html; charset=utf-8` into the lower-cased type and the charset (utf-8 for text/*).
pub fn split_mime(mime: &str) -> (String, Option<String>) {
    let mut parts = mime.split(';').map(str::trim);
    let ty = parts.next().unwrap_or("").to_ascii_lowercase();
    let charset = parts
        .find_map(|p| p.get(..8).filter(|k| k.eq_ignore_ascii_case("charset=")).map(|_| p[8..].trim_matches('"').to_owned()))
        .or_else(|| ty.starts_with("text/").then(|| "utf-8".to_owned()));
    (ty, charset)
}

/// Defence in depth: the CSP also travels inside the document; the blackout CSS follows it.
pub fn inject_head(html: &[u8], dark: bool) -> Vec<u8> {
    let text = String::from_utf8_lossy(html);
    let mut meta = format!("<meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\">");
    if dark {
        meta.push_str(&format!("<style id=\"skepi-dark\">{DARK_CSS}</style>"));
    }
    match HEAD_OPEN.find(&text) {
        Some(m) => format!("{}{}{}", &text[..m.end()], meta, &text[m.end()..]).into_bytes(),
        None => format!("{meta}{text}").into_bytes(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ViewerResponse {
    pub status: u16,
    pub content_type: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl ViewerResponse {
    fn new(status: u16, content_type: &str, body: Vec<u8>) -> Self {
        let headers = SECURITY_HEADERS.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())).collect();
        Self { status, content_type: content_type.to_owned(), headers, body }
    }

    pub fn forbidden() -> Self {
        Self::new(403, "text/plain; charset=utf-8", Vec::new())
    }

    pub fn not_found() -> Self {
        Self::new(404, "text/plain; charset=utf-8", Vec::new())
    }

    pub fn ok(mime: &str, body: Vec<u8>, dark: bool) -> Self {
        let (ty, charset) = split_mime(mime);
        let content_type = match &charset {
            Some(c) => format!("{ty}; charset={c}"),
            None => ty.clone(),
        };
        let body = if ty == "text/html" { inject_head(&body, dark) } else { body };
        Self::new(200, &content_type, body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0f2c3e4a-1b2c-4d5e-8f90-123456789abc";

    #[test]
    fn parses_archive_and_decoded_path() {
        assert_eq!(parse_path(&format!("/{ID}/A/Water%20(molecule)")), Some(Target { archive_id: ID.into(), path: "A/Water (molecule)".into() }));
        assert_eq!(parse_path(&format!("/{ID}/Canberra")).map(|t| t.path), Some("Canberra".into()));
    }

    #[test]
    fn rejects_traversal_and_malformed_urls() {
        for bad in [
            format!("/{ID}/../secret"),
            format!("/{ID}/A/../../x"),
            format!("/{ID}/%2e%2e/x"),
            format!("/{ID}/%252e%252e/x"),
            format!("/{ID}/A\\..\\x"),
            format!("/{ID}/A%5C..%5Cx"),
            format!("/{ID}/a%00b"),
            format!("/{ID}/"),
            format!("/{ID}"),
            "/not-an-id!/x".to_owned(),
            "/../etc/passwd".to_owned(),
            String::new(),
            format!("/{ID}/%ff%fe"),
        ] {
            assert_eq!(parse_path(&bad), None, "{bad}");
        }
    }

    #[test]
    fn every_response_carries_the_csp() {
        for r in [ViewerResponse::forbidden(), ViewerResponse::not_found(), ViewerResponse::ok("image/png", vec![1, 2], false)] {
            assert!(r.headers.iter().any(|(k, v)| k == "Content-Security-Policy" && v == CSP), "{}", r.status);
            assert!(r.headers.iter().any(|(k, v)| k == "X-Content-Type-Options" && v == "nosniff"));
        }
        assert!(!CSP.contains("script-src") && CSP.contains("default-src 'none'") && CSP.contains("sandbox"));
    }

    #[test]
    fn html_gets_the_meta_csp_and_optional_dark_css() {
        let r = ViewerResponse::ok("text/html", b"<html><head><title>x</title></head><body>b</body></html>".to_vec(), true);
        let body = String::from_utf8(r.body).expect("utf8");
        assert!(body.starts_with("<html><head><meta http-equiv=\"Content-Security-Policy\""));
        assert!(body.contains("skepi-dark"));
        assert_eq!(r.content_type, "text/html; charset=utf-8");
        let plain = ViewerResponse::ok("text/html", b"<p>no head</p>".to_vec(), false);
        assert!(String::from_utf8(plain.body).expect("utf8").starts_with("<meta http-equiv"));
    }

    #[test]
    fn mime_split() {
        assert_eq!(split_mime("text/html; charset=\"UTF-8\""), ("text/html".into(), Some("UTF-8".into())));
        assert_eq!(split_mime("image/svg+xml"), ("image/svg+xml".into(), None));
        assert_eq!(split_mime("text/css"), ("text/css".into(), Some("utf-8".into())));
    }
}
