//! Build checks for the desktop app:
//! - the app commands get generated `allow-*` permissions; only the main window's capability lists
//!   them (the article viewer has none, so article content cannot reach IPC);
//! - release builds embed the release catalog, which must verify with the release keys (and those
//!   must differ from the test keys), like `skepiCheckReleaseCatalog` on Android;
//! - the `test-mirror` feature (trusts the local test mirror CA) is refused in release builds;
//! - the libzim DLLs (pinned in native/kiwix) are copied into `bin/` for bundling.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use ed25519_dalek::{Signature, VerifyingKey};
use std::path::{Path, PathBuf};

pub const COMMANDS: &[&str] = &[
    "zim_open_installed",
    "zim_suggest",
    "zim_search",
    "zim_article",
    "zim_plain_text",
    "viewer_open",
    "viewer_close",
    "llm_load",
    "llm_generate",
    "llm_abort",
    "llm_unload",
    "device_info",
    "content_state",
    "content_reconcile",
    "content_download",
    "content_cancel",
    "content_check_update",
    "content_import",
    "content_verify",
    "content_remove",
    "content_consent",
    "content_choose_folder",
    "settings_get",
    "settings_set",
    "places_query",
    "station_addresses",
    "station_choose_apk",
    "station_start",
    "station_stop",
    "station_status",
    "report_save",
];

fn repo() -> PathBuf {
    PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir")).join("../../..")
}

fn json(path: &Path) -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).expect("json")
}

fn key(v: &serde_json::Value) -> (String, [u8; 32]) {
    let id = v["keyId"].as_str().expect("keyId").to_owned();
    let bytes: [u8; 32] = STANDARD.decode(v["publicKey"].as_str().expect("publicKey")).expect("base64").try_into().expect("32 bytes");
    (id, bytes)
}

/// The release catalog must verify with the release keys over its exact bytes.
fn check_release_catalog() {
    let root = repo();
    let keys = json(&root.join("catalog/keys/release.json"));
    let test = json(&root.join("catalog/keys/test.json"));
    assert_eq!(keys["purpose"], "release", "catalog/keys/release.json must have purpose release");
    let release_keys = [key(&keys["active"]), key(&keys["backup"])];
    let test_keys = [key(&test["active"]), key(&test["backup"])];
    for (_, pk) in &release_keys {
        assert!(test_keys.iter().all(|(_, t)| t != pk), "release keys must differ from the test keys");
    }
    let bytes = std::fs::read(root.join("catalog/embedded/release/catalog.json")).expect("release catalog");
    let sig_text = std::fs::read_to_string(root.join("catalog/embedded/release/catalog.json.sig")).expect("release signature");
    let sig: [u8; 64] = STANDARD.decode(sig_text.split_whitespace().collect::<String>()).expect("base64").try_into().expect("64 bytes");
    let doc: serde_json::Value = serde_json::from_slice(&bytes).expect("catalog json");
    let key_id = doc["keyId"].as_str().expect("keyId");
    let (_, pk) =
        release_keys.iter().find(|(id, _)| id == key_id).unwrap_or_else(|| panic!("release catalog signed by unknown key {key_id}"));
    VerifyingKey::from_bytes(pk)
        .expect("key")
        .verify_strict(&bytes, &Signature::from_bytes(&sig))
        .expect("release catalog signature does not verify with the release keys");
}

fn copy_libzim() {
    let root = repo();
    let lock = json(&root.join("native/kiwix/libzim-windows.lock.json"));
    let version = lock["version"].as_str().expect("version");
    let dir = std::env::var_os("SKEPI_LIBZIM_DIR").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA"))
            .join("skepi")
            .join("native")
            .join(format!("libzim-{version}"))
    });
    let out = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir")).join("bin");
    std::fs::create_dir_all(&out).expect("bin dir");
    // zim-ffi's build script already verified these files against their pinned SHA-256.
    for dll in lock["runtimeDlls"].as_array().expect("runtimeDlls") {
        let src = dir.join(dll.as_str().expect("dll"));
        let dst = out.join(src.file_name().expect("name"));
        if std::fs::metadata(&dst).map(|m| m.len()).ok() != std::fs::metadata(&src).map(|m| m.len()).ok() {
            std::fs::copy(&src, &dst).unwrap_or_else(|e| panic!("copy {}: {e}", src.display()));
        }
    }
    // App-local MSVC runtime (redistributable files): zim-9.dll is built with toolset 14.44, so the
    // runtime next to the exe must be at least that new on machines without a recent VC++ redist.
    let system = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into())).join("System32");
    for dll in ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"] {
        let src = system.join(dll);
        let dst = out.join(dll);
        if src.is_file() && std::fs::metadata(&dst).map(|m| m.len()).ok() != std::fs::metadata(&src).map(|m| m.len()).ok() {
            std::fs::copy(&src, &dst).unwrap_or_else(|e| panic!("copy {}: {e}", src.display()));
        }
    }
}

fn main() {
    let profile = std::env::var("PROFILE").unwrap_or_default();
    if profile == "release" {
        assert!(std::env::var_os("CARGO_FEATURE_TEST_MIRROR").is_none(), "the test-mirror feature is for debug builds only");
        check_release_catalog();
    }
    for p in ["catalog/embedded", "catalog/keys", "catalog/sources", "native/kiwix/libzim-windows.lock.json"] {
        println!("cargo:rerun-if-changed={}", repo().join(p).display());
    }
    copy_libzim();
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))
            // libzim and llama.cpp are built against the dynamic MSVC runtime (/MD).
            .windows_attributes(tauri_build::WindowsAttributes::new().static_vc_runtime(false)),
    )
    .expect("tauri build");
}
