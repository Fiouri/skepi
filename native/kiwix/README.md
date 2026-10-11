# native/kiwix

Pinned native dependencies for `modules/expo-zim` (Android, iOS) and `crates/zim-ffi` (Windows, macOS).
All of them are official Kiwix/openZIM builds of the same libzim, 9.7.0.

| Item | Value |
| --- | --- |
| Artifact | `org.kiwix:libkiwix:2.6.0` (official java-libkiwix AAR, Maven Central) |
| Contains | libkiwix 14.2.1, libzim 9.7.0, Xapian, ICU 73.2 (code only, **no ICU data**) |
| SHA-256 | `2722f22d6b02b26cb3b23bcedd0b74a2d1d70e190bc98caf000660af53bcbe43` (matches Maven Central `.sha256`) |

`kiwix.lock.json` is the source of truth. The `verifyKiwixChecksum` Gradle task in
`modules/expo-zim/android/build.gradle` hashes the resolved AAR before every build and fails on mismatch.
Upgrades only through a PR that updates the lock file with a green CI.

## ICU data

The AAR links ICU statically but ships only the 64-byte `icudt73_dat` stub. Full ICU data
(`icudt73l.dat`) must be supplied on disk and registered with `JNIKiwix.setDataDirectory`.
`expo-zim` does that when `<externalFilesDir>/icu/icudt73l.dat` exists (pushed by
`scripts/provision.ps1 -WithIcu`). See `docs/spike-report.md` for the measured impact.

## Fallback

If the published AAR ever becomes unusable, build with kiwix-build
(`kiwix-build --target-platform android_arm64 libkiwix`) and vendor the AAR here with its SHA-256.

## Windows (desktop)

`libzim-windows.lock.json`: the official `libzim_win-x86_64-9.7.0.zip` (openZIM), SHA-256 of the archive and
of every DLL/LIB; `fetch-libzim-windows.ps1` downloads and verifies it, `crates/zim-ffi/build.rs` re-checks it.

## Apple: iOS and macOS (Phase 3b-0)

`corekiwix.lock.json` is the source of truth.

| Item | Value |
| --- | --- |
| Artifact | `libkiwix_xcframework-14.2.1-2.tar.gz` (kiwix-build, `download.kiwix.org/release/libkiwix`) — the build Kiwix's own iOS/macOS app pins |
| Contains | `CoreKiwix.xcframework`: libkiwix 14.2.1, libzim 9.7.0, Xapian, ICU 73.2 **with data**, zstd, lzma, zlib (static `merged.a` per slice) |
| Slices | `ios-arm64`, `ios-arm64_x86_64-simulator`, `macos-arm64_x86_64` |
| SHA-256 | archive `14820648…ee1561` (publisher MD5 also checked), plus every slice's `merged.a` and `Info.plist` |

`fetch-corekiwix.sh` downloads, checks MD5 + SHA-256 and extracts to `$SKEPI_COREKIWIX_DIR`
(default `~/Library/Caches/skepi/native/corekiwix-<version>`); `--install-ios` also copies the iOS slices into
`modules/expo-zim/ios/Frameworks` (git-ignored). `SkepiZim.podspec` (iOS) and `crates/zim-ffi/build.rs` (macOS)
re-check the SHA-256 of the slices they link and never download anything.

- The archive also holds libcurl and libmicrohttpd (libkiwix's downloader and server). SKEPI references only
  libzim symbols, so the static linker leaves them out; CI asserts that no `curl_*` / `MHD_*` symbol is in
  the iOS app or the macOS binary.
- ICU data is linked in (the Android AAR ships only the stub and reads `icudt73l.dat` when provisioned):
  title normalisation and suggestion results may differ from Android without ICU data. Retrieval parity
  with the phone is measured on a real iPhone/Mac later (docs/phase-3b0-report.md).
- The universal macOS archive is thinned to the target architecture (`lipo -thin`) and linked statically into
  the desktop binary; nothing is shipped next to it (unlike the Windows DLLs).
