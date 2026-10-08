//! `Range: bytes=a-b` / `bytes=a-` (one range only), as `Http.parseRange` in modules/expo-transfer.
//! Used by the map protocol (PMTiles reads) and Station mode.

use regex::Regex;
use std::sync::LazyLock;

static RANGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^bytes=(\d{1,19})-(\d{0,19})$").expect("regex"));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RangeError {
    /// Malformed, multi-range or suffix (`bytes=-n`): 416.
    Unsupported,
    /// Starts at or after the end of the file: 416.
    Unsatisfiable,
}

/// Inclusive byte range inside a file of `size` bytes; `Ok(None)` when no header was sent.
pub fn parse_range(header: Option<&str>, size: u64) -> Result<Option<(u64, u64)>, RangeError> {
    let Some(h) = header else { return Ok(None) };
    let caps = RANGE.captures(h.trim()).ok_or(RangeError::Unsupported)?;
    let start: u64 = caps[1].parse().map_err(|_| RangeError::Unsupported)?;
    let end = if caps[2].is_empty() { size.saturating_sub(1) } else { caps[2].parse::<u64>().map_err(|_| RangeError::Unsupported)?.min(size.saturating_sub(1)) };
    if size == 0 || start >= size || end < start {
        return Err(RangeError::Unsatisfiable);
    }
    Ok(Some((start, end)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range(None, 10), Ok(None));
        assert_eq!(parse_range(Some("bytes=0-3"), 10), Ok(Some((0, 3))));
        assert_eq!(parse_range(Some("bytes=5-"), 10), Ok(Some((5, 9))));
        assert_eq!(parse_range(Some("bytes=5-100"), 10), Ok(Some((5, 9))));
        assert_eq!(parse_range(Some("bytes=10-"), 10), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=4-2"), 10), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=-5"), 10), Err(RangeError::Unsupported));
        assert_eq!(parse_range(Some("bytes=0-1,4-5"), 10), Err(RangeError::Unsupported));
        assert_eq!(parse_range(Some("items=0-1"), 10), Err(RangeError::Unsupported));
        assert_eq!(parse_range(Some("bytes=99999999999999999999-"), 10), Err(RangeError::Unsupported));
    }
}
