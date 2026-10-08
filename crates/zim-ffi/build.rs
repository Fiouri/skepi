//! Links the official libzim Windows build pinned in `native/kiwix/libzim-windows.lock.json`.
//! Nothing is downloaded here: `native/kiwix/fetch-libzim-windows.ps1` fetches and verifies the files,
//! and this script re-checks the SHA-256 of every file it links or ships before compiling.

use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

fn sha256_file(path: &Path) -> String {
    let mut file = fs::File::open(path).unwrap_or_else(|e| panic!("cannot open {}: {e}", path.display()));
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).expect("read");
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let lock_path = manifest_dir.join("../../native/kiwix/libzim-windows.lock.json");
    println!("cargo:rerun-if-changed={}", lock_path.display());
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=src/shim.cc");
    println!("cargo:rerun-if-changed=include/shim.h");
    println!("cargo:rerun-if-env-changed=SKEPI_LIBZIM_DIR");

    let lock: serde_json::Value = serde_json::from_str(&fs::read_to_string(&lock_path).expect("libzim lock file")).expect("lock json");
    let version = lock["version"].as_str().expect("version");
    let dir = std::env::var_os("SKEPI_LIBZIM_DIR").map(PathBuf::from).unwrap_or_else(|| {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).expect("LOCALAPPDATA (or set SKEPI_LIBZIM_DIR)");
        local.join("skepi").join("native").join(format!("libzim-{version}"))
    });
    if !dir.is_dir() {
        panic!(
            "libzim {version} not found in {} — run native/kiwix/fetch-libzim-windows.ps1 (or set SKEPI_LIBZIM_DIR)",
            dir.display()
        );
    }
    for (rel, expected) in lock["files"].as_object().expect("files") {
        let got = sha256_file(&dir.join(rel));
        let expected = expected.as_str().expect("hash");
        assert_eq!(got, expected, "SHA-256 mismatch for {rel} in {} (pinned in native/kiwix)", dir.display());
    }

    cxx_build::bridge("src/lib.rs")
        .file("src/shim.cc")
        .include(dir.join("include"))
        .include(&manifest_dir)
        .std("c++17")
        .flag_if_supported("/EHsc")
        .flag_if_supported("/utf-8")
        // libzim exports classes with std members (C4251) and is built with the same /MD runtime.
        .flag_if_supported("/wd4251")
        .compile("skepi_zim_shim");

    println!("cargo:rustc-link-search=native={}", dir.join("lib").display());
    println!("cargo:rustc-link-lib=dylib=zim");
    // Consumers (tests, the Tauri app) copy these next to their executables.
    println!("cargo:bin_dir={}", dir.join("bin").display());
    let runtime: Vec<String> = lock["runtimeDlls"]
        .as_array()
        .expect("runtimeDlls")
        .iter()
        .map(|v| dir.join(v.as_str().expect("dll")).display().to_string())
        .collect();
    println!("cargo:runtime_dlls={}", runtime.join(";"));
    copy_runtime_dlls(&runtime);
}

/// `cargo test` runs the test binaries from `target/<profile>/deps`; the loader finds DLLs next to them.
fn copy_runtime_dlls(dlls: &[String]) {
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    // OUT_DIR = target/<profile>/build/zim-ffi-<hash>/out
    let Some(profile_dir) = out_dir.ancestors().nth(3) else { return };
    for target in [profile_dir.to_path_buf(), profile_dir.join("deps")] {
        if !target.is_dir() {
            continue;
        }
        for dll in dlls {
            let src = Path::new(dll);
            let dst = target.join(src.file_name().expect("file name"));
            let stale = fs::metadata(&dst).map(|m| m.len() != fs::metadata(src).map(|s| s.len()).unwrap_or(0)).unwrap_or(true);
            if stale {
                let _ = fs::copy(src, &dst);
            }
        }
    }
}
