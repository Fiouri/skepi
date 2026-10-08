//! libzim through the bridge on the committed fixture ZIMs (tools/rag-eval/fixtures, CC BY-SA).

use std::path::PathBuf;
use zim_ffi::Archive;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/rag-eval/fixtures").join(name)
}

#[test]
fn opens_and_reads_metadata() {
    let a = Archive::open(&fixture("eval-smoke-en.zim")).expect("open");
    let m = a.meta().expect("meta");
    assert_eq!(m.uuid.len(), 36, "uuid {}", m.uuid);
    assert!(m.uuid.chars().all(|c| c == '-' || c.is_ascii_hexdigit()));
    assert_eq!(m.language, "eng");
    assert!(m.article_count > 10);
    assert!(m.has_fulltext_index);
    assert!(m.has_title_index);
    assert!(m.file_size > 0);
}

#[test]
fn fulltext_and_suggestions_find_the_article() {
    let a = Archive::open(&fixture("eval-smoke-en.zim")).expect("open");
    let hits = a.search("canberra", 8, false).expect("search");
    assert!(hits.iter().any(|h| h.path == "Canberra"), "{:?}", hits.iter().map(|h| &h.path).collect::<Vec<_>>());
    assert!(hits.iter().all(|h| h.has_score && !h.has_snippet));
    let s = a.suggest("canber", 10).expect("suggest");
    assert_eq!(s.first().map(|h| h.path.as_str()), Some("Canberra"));
}

#[test]
fn reads_html_and_rejects_missing_entries() {
    let a = Archive::open(&fixture("eval-smoke-en.zim")).expect("open");
    let item = a.read_item("Canberra").expect("item");
    assert!(item.mime.starts_with("text/html"), "{}", item.mime);
    assert!(String::from_utf8_lossy(&item.data).contains("Canberra"));
    assert!(a.read_item("No_such_article_here").is_err());
    assert!(!a.has_entry("No_such_article_here").expect("has_entry"));
}

#[test]
fn refuses_non_zim_files() {
    let not_zim = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    assert!(Archive::open(&not_zim).is_err());
    assert!(Archive::open(&fixture("missing.zim")).is_err());
}

#[test]
fn concurrent_searches_are_safe() {
    let a = std::sync::Arc::new(Archive::open(&fixture("eval-smoke-en.zim")).expect("open"));
    let threads: Vec<_> = (0..4)
        .map(|i| {
            let a = a.clone();
            std::thread::spawn(move || {
                for _ in 0..10 {
                    let q = if i % 2 == 0 { "earthquake" } else { "water" };
                    assert!(!a.search(q, 8, false).expect("search").is_empty());
                    assert!(!a.suggest(q, 5).expect("suggest").is_empty());
                }
            })
        })
        .collect();
    for t in threads {
        t.join().expect("thread");
    }
}
