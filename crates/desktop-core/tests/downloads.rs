//! ContentStore against the local HTTPS test mirror (e2e/mirror/server.mjs, needs Node): downloads
//! verify and install, a corrupt mirror falls back to the next one, a file corrupt everywhere is
//! never installed, interrupted downloads resume from the verified chunks, catalog updates adopt only
//! a valid newer catalog, and imports follow the verified/unverified rules.
//! Run with: cargo test -p desktop-core --features test-mirror --test downloads
#![cfg(feature = "test-mirror")]

use desktop_core::catalog::sha256_hex;
use desktop_core::content::{ContentError, ContentStore, EmbeddedCatalog};
use desktop_core::db::{AppDb, PackSource};
use desktop_core::download::{Http, check_catalog_update, download_pack};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

fn repo(p: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(p)
}

struct Mirror(Child);

impl Drop for Mirror {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn admin(path: &str) -> String {
    let mut s = TcpStream::connect("127.0.0.1:8444").expect("mirror admin");
    write!(s, "GET {path} HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").expect("write");
    let mut out = String::new();
    s.read_to_string(&mut out).expect("read");
    out
}

fn start_mirror() -> Mirror {
    let mut child = Command::new("node")
        .arg(repo("e2e/mirror/server.mjs"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("node e2e/mirror/server.mjs");
    for _ in 0..100 {
        if TcpStream::connect("127.0.0.1:8443").is_ok() && TcpStream::connect("127.0.0.1:8444").is_ok() {
            admin("/reset");
            return Mirror(child);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    panic!("test mirror did not start");
}

fn store(dir: &Path) -> Arc<ContentStore> {
    let db = Arc::new(AppDb::open(&dir.join("app.db"), &[3u8; 32], 1).expect("db"));
    let embedded = EmbeddedCatalog {
        catalog: std::fs::read(repo("catalog/embedded/debug/catalog.json")).expect("catalog"),
        signature: std::fs::read_to_string(repo("catalog/embedded/debug/catalog.json.sig")).expect("sig"),
        pinned_keys: std::fs::read_to_string(repo("catalog/keys/test.json")).expect("keys"),
        update_urls: vec!["https://127.0.0.1:8443/catalog/".into()],
    };
    Arc::new(ContentStore::new(db, dir.join("appdata"), dir.join("content"), embedded).expect("store"))
}

#[tokio::test(flavor = "multi_thread")]
async fn mirror_downloads_fallback_rejection_resume_updates_and_imports() {
    let _mirror = start_mirror();
    let dir = tempfile::tempdir().expect("tmp");
    let s = store(dir.path());
    let http = Http::new().expect("http");
    assert_eq!(s.catalog().expect("catalog").sequence, 3);

    // Good download: verified chunk by chunk, installed atomically.
    let mut phases = Vec::new();
    let row = download_pack(s.clone(), &http, "test-smoke-en", Arc::new(AtomicBool::new(false)), |p| phases.push(p.phase))
        .await
        .expect("download");
    assert!(row.verified && row.source == PackSource::Download);
    assert_eq!(
        sha256_hex(&std::fs::read(&row.path).expect("file")),
        std::fs::read(repo("tools/rag-eval/fixtures/eval-smoke-en.zim")).map(|b| sha256_hex(&b)).expect("fixture")
    );
    assert!(phases.contains(&"verifying") && phases.last() == Some(&"done"));

    // First mirror corrupt: rejected at its first chunk, the second mirror succeeds.
    let mut rejected = 0;
    let row = download_pack(s.clone(), &http, "test-mirror-fallback", Arc::new(AtomicBool::new(false)), |p| rejected = p.rejected_mirrors)
        .await
        .expect("fallback");
    assert!(row.verified);
    assert_eq!(rejected, 1);

    // Corrupt everywhere: nothing installed, no partial left.
    let err = download_pack(s.clone(), &http, "test-corrupt", Arc::new(AtomicBool::new(false)), |_| {}).await.unwrap_err();
    assert!(matches!(err, ContentError::Download(_)), "{err}");
    assert!(!s.root().join("zim/eval-smoke-el.zim").exists());
    assert!(!s.tmp_dir().join("eval-smoke-el.zim.partial").exists());

    // Resume: a partial whose first 64 KiB chunk is right and the rest garbage restarts at chunk 1.
    s.remove("test-smoke-en").expect("remove");
    let full = std::fs::read(repo("tools/rag-eval/fixtures/eval-smoke-en.zim")).expect("fixture");
    let mut partial = full[..65536].to_vec();
    partial.extend(vec![0u8; 30_000]);
    std::fs::write(s.tmp_dir().join("eval-smoke-en.zim.partial"), &partial).expect("partial");
    admin("/reset");
    download_pack(s.clone(), &http, "test-smoke-en", Arc::new(AtomicBool::new(false)), |_| {}).await.expect("resume");
    let log = admin("/log");
    assert!(log.contains("\"range\":\"bytes=65536-\""), "{log}");
    assert!(log.contains("\"userAgent\":\"SKEPI\"") && !log.contains("\"query\":\"?"), "{log}");

    // Catalog updates: tampered and rollback rejected, good (sequence 4) adopted and persisted.
    admin("/mode/tampered");
    assert!(check_catalog_update(&s, &http).await.is_err());
    admin("/mode/rollback");
    assert!(check_catalog_update(&s, &http).await.is_err());
    admin("/mode/good");
    assert_eq!(check_catalog_update(&s, &http).await.expect("update"), Some(4));
    assert_eq!(s.catalog().expect("catalog").sequence, 4);
    assert_eq!(s.db.accepted_catalog().expect("state").sequence, Some(4));
    s.load_catalog().expect("reload");
    assert_eq!(s.catalog().expect("catalog").sequence, 4, "the stored catalog wins over the older embedded one");

    // Imports: a catalog file becomes verified, an unknown ZIM unverified, an unknown model is refused.
    let src = dir.path().join("usb");
    std::fs::create_dir_all(&src).expect("usb");
    std::fs::copy(repo("e2e/fixtures/p2p-propagation.zim"), src.join("p2p-propagation.zim")).expect("copy");
    std::fs::copy(repo("tools/rag-eval/fixtures/eval-heldout.zim"), src.join("heldout.zim")).expect("copy");
    std::fs::write(src.join("model.gguf"), b"GGUF not in the catalog").expect("gguf");
    let verified = s.import_file(&src.join("p2p-propagation.zim"), None, |_, _| {}).expect("import verified");
    assert!(verified.verified && verified.id == "test-propagation");
    let unverified = s.import_file(&src.join("heldout.zim"), None, |_, _| {}).expect("import unverified");
    assert!(!unverified.verified && unverified.consent_at.is_none() && unverified.id.starts_with("local-"));
    assert!(matches!(s.import_file(&src.join("model.gguf"), None, |_, _| {}), Err(ContentError::Rejected(_))));
    assert!(std::fs::read_dir(s.tmp_dir()).expect("tmp").next().is_none(), "no leftovers in tmp/");
}
