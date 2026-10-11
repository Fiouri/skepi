//! Links the official Kiwix builds pinned in `native/kiwix`:
//! - Windows: the libzim 9.7.0 build in `libzim-windows.lock.json` (DLLs shipped next to the exe);
//! - macOS (Phase 3b-0): the macOS slice of CoreKiwix.xcframework in `corekiwix.lock.json` (libzim
//!   9.7.0, linked statically; the same artifact as the iOS app).
//!
//! Nothing is downloaded here: `native/kiwix/fetch-libzim-windows.ps1` / `fetch-corekiwix.sh` fetch and
//! verify the files, and this script re-checks the SHA-256 of every file it links or ships before compiling.

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
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=src/shim.cc");
    println!("cargo:rerun-if-changed=include/shim.h");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        link_corekiwix_macos(&manifest_dir);
    } else {
        link_libzim_windows(&manifest_dir);
    }
}

fn link_libzim_windows(manifest_dir: &Path) {
    let lock_path = manifest_dir.join("../../native/kiwix/libzim-windows.lock.json");
    println!("cargo:rerun-if-changed={}", lock_path.display());
    println!("cargo:rerun-if-env-changed=SKEPI_LIBZIM_DIR");

    let lock: serde_json::Value = serde_json::from_str(&fs::read_to_string(&lock_path).expect("libzim lock file")).expect("lock json");
    let version = lock["version"].as_str().expect("version");
    let dir = std::env::var_os("SKEPI_LIBZIM_DIR").map(PathBuf::from).unwrap_or_else(|| {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).expect("LOCALAPPDATA (or set SKEPI_LIBZIM_DIR)");
        local.join("skepi").join("native").join(format!("libzim-{version}"))
    });
    if !dir.is_dir() {
        panic!("libzim {version} not found in {} — run native/kiwix/fetch-libzim-windows.ps1 (or set SKEPI_LIBZIM_DIR)", dir.display());
    }
    for (rel, expected) in lock["files"].as_object().expect("files") {
        let got = sha256_file(&dir.join(rel));
        let expected = expected.as_str().expect("hash");
        assert_eq!(got, expected, "SHA-256 mismatch for {rel} in {} (pinned in native/kiwix)", dir.display());
    }

    cxx_build::bridge("src/lib.rs")
        .file("src/shim.cc")
        .include(dir.join("include"))
        .include(manifest_dir)
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

/// macOS: the static macOS slice of the pinned CoreKiwix.xcframework (libzim 9.7.0, Xapian, ICU 73.2 with
/// data, zstd, lzma, zlib in one archive). The universal archive is thinned to the target architecture
/// (`lipo`) and passed to the final link only (`-bundle`), so it is never copied into the rlib.
fn link_corekiwix_macos(manifest_dir: &Path) {
    let lock_path = manifest_dir.join("../../native/kiwix/corekiwix.lock.json");
    println!("cargo:rerun-if-changed={}", lock_path.display());
    println!("cargo:rerun-if-env-changed=SKEPI_COREKIWIX_DIR");

    let lock: serde_json::Value = serde_json::from_str(&fs::read_to_string(&lock_path).expect("CoreKiwix lock file")).expect("lock json");
    let version = lock["version"].as_str().expect("version");
    let dir = std::env::var_os("SKEPI_COREKIWIX_DIR").map(PathBuf::from).unwrap_or_else(|| {
        let home = std::env::var_os("HOME").map(PathBuf::from).expect("HOME (or set SKEPI_COREKIWIX_DIR)");
        home.join("Library/Caches/skepi/native").join(format!("corekiwix-{version}"))
    });
    let slice_rel = "CoreKiwix.xcframework/macos-arm64_x86_64/merged.a";
    let archive = dir.join(slice_rel);
    if !archive.is_file() {
        panic!("CoreKiwix {version} not found in {} — run native/kiwix/fetch-corekiwix.sh (or set SKEPI_COREKIWIX_DIR)", dir.display());
    }
    for rel in ["CoreKiwix.xcframework/Info.plist", slice_rel] {
        let expected = lock["files"][rel].as_str().unwrap_or_else(|| panic!("{rel} is not pinned in {}", lock_path.display()));
        assert_eq!(sha256_file(&dir.join(rel)), expected, "SHA-256 mismatch for {rel} in {} (pinned in native/kiwix)", dir.display());
    }

    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        other => panic!("unsupported macOS architecture {other:?}"),
    };
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let thin = out_dir.join("libskepi_corekiwix.a");
    let status = std::process::Command::new("xcrun")
        .args(["lipo"])
        .arg(&archive)
        .args(["-thin", arch, "-output"])
        .arg(&thin)
        .status()
        .expect("xcrun lipo");
    assert!(status.success(), "lipo -thin {arch} failed for {}", archive.display());

    let headers = dir.join("CoreKiwix.xcframework/macos-arm64_x86_64/Headers");
    cxx_build::bridge("src/lib.rs").file("src/shim.cc").include(&headers).include(manifest_dir).std("c++17").compile("skepi_zim_shim");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static:-bundle=skepi_corekiwix");
    println!("cargo:rustc-link-lib=c++");
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
