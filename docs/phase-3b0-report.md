# Phase 3b-0 · Apple builds in CI (no Mac, no signing)

Goal: every Apple-specific line compiles and runs at least once in CI on GitHub's macOS runners, so iOS
and macOS work can continue without a Mac. No signing identity, no TestFlight, no store work. Design:
`docs/architecture.md` ("Apple builds (Phase 3b-0)"). Pins: `native/kiwix/corekiwix.lock.json`.

Runner: `macos-latest` (Apple silicon) = macOS 26.6.2, Xcode 26.6, iOS Simulator 26.5 (iPhone 17).

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| `ios-simulator` and `desktop-macos` green on main; existing jobs unchanged and green | Green on main, cold and warm runs (see "CI runs and timings"); every existing job green on every run |
| Swift binding unit tests pass on the Simulator | **26/26** (`SkepiZim-Unit-Tests`, iPhone 17 / iOS 26.5): binding 10, catalog + hash 5, viewer sealing 11 |
| Maestro iOS flows pass or are skipped with a hardware reason | **7/7 pass** (6 app flows + the secure-storage failure flow); the skipped flows are listed below, each with its reason |
| Bundle scan for card step texts on iOS and macOS | iOS: the built `main.jsbundle` (Hermes), PASS 0/202, in the build phase and as a CI step. macOS: the Developer Preview UI that `tauri build` embeds, PASS 0/202 |
| Typecheck, lint, unit tests, Rust gates green locally (Windows) and in CI | Local: `pnpm verify` 46/46 tasks (JS unit tests 544, 8 of them new), `cargo fmt` / `clippy -D warnings` / `cargo test` (42 passed, 1 ignored: needs the GGUF). CI: the same on Linux, Windows and macOS |
| No network at runtime except user-initiated downloads | iOS: no code path to the network in this phase (downloads and P2P report "not supported"). macOS: idle egress run, **0 connections outside loopback** (app + WebKit Networking + WebContent; `lsof` 160 samples; `nettop` 0 external bytes) |
| Every file verified against the signed catalog before opening | The core path is unchanged (`@skepi/core` verifies before `openArchive`). Maestro: provisioned packs count as "installed" only after the startup hash against the embedded release catalog. Swift tests: the committed catalogs' Ed25519 signatures (the 9 cases of `catalog/verification-expectations.json`) and the fixtures' whole-file and chunk hashes |
| No secrets in CI; nothing signed | No secret is used. The checked Release build is `CODE_SIGNING_ALLOWED=NO`; the macOS bundle is `--no-sign`. Owner decision (2026-10-11): the Simulator copy that Maestro installs is ad-hoc signed with no identity (see "Simulator signing") |

## What compiles

| Area | iOS (Simulator, Release, unsigned) | macOS desktop (aarch64, release, unsigned) |
| --- | --- | --- |
| libzim 9.7.0 | `SkepiZim` pod: Objective-C++ shim (`SKZArchive`) over the iOS slices of CoreKiwix.xcframework 14.2.1-2 | `crates/zim-ffi`: the existing cxx shim over the macOS slice of the same xcframework, thinned with `lipo` and linked statically |
| Article viewer | `SealedWebView` (WKWebView): `zim://` scheme handler, content rule list, page JavaScript off, no script message handlers or user scripts, non-persistent data, no fraud lookups or link previews, CSP header + meta on every response, blackout CSS | Tauri viewer window over the `zim` protocol (`zim://localhost` on WKWebView), JavaScript off, incognito, no IPC capability |
| Inference | llama.rn built from source (`RNLLAMA_BUILD_FROM_SOURCE=1`) | llama.cpp with Metal (`metal` feature) |
| Other native code | `expo-hash` (SkepiHash, CryptoKit), `expo-content-store` (local files, embedded catalog, import), `expo-device-profile`, `expo-emergency-tools`, `expo-transfer` (unsupported) | Keychain app.db key, sysctl/statvfs probes, `getifaddrs` Station addresses, `maps://localhost` / `zim://localhost` origins |
| Third-party native | React Native 0.86 / Expo 57 (prebuilt React Native core, as in Expo's template), MapLibre (Swift package), op-sqlite with SQLCipher | Tauri 2.12, rusqlite with vendored SQLCipher/OpenSSL, rustls |

## What runs in CI

**iOS (`ios-simulator`).**

1. `expo prebuild -p ios --clean --no-install`, `pod install` (SkepiZim with its test spec, SkepiHash, llama.rn from source).
2. Draft-cards gate: `plugins/ios/skepi-xcode.sh resources` with `CONFIGURATION=Release` and no preview flag **fails** with "emergency cards are DRAFT" (like `skepiCheckEmergencyCards` on Android).
3. `xcodebuild` Release, `iphonesimulator`, `ARCHS=arm64`, `CODE_SIGNING_ALLOWED=NO`, `SKEPI_PREVIEW=1`. Build phases embed the release catalog (verified with the release keys) and the map assets, check the cards with `--preview` and scan the built bundle.
4. The app binary holds no `curl_*` / `MHD_*` symbol (CoreKiwix's unused downloader and server are not linked); libzim symbols are present.
5. XCTest `SkepiZim-Unit-Tests` on a Simulator: 26/26 (table below).
6. Maestro 2.11.0 (zip pinned by SHA-256) on a fresh Simulator. First the unsigned build must stop on "Secure storage unavailable" (`e2e/ios/startup/secure-storage-unavailable.yaml`). Then the ad-hoc copy, with the packs provisioned (`wikipedia_en_top_mini`, `wikipedia_en_medicine_mini`, `map-gr`, `places-gr`; URLs and SHA-256 from the embedded release catalog), runs `01-onboarding` … `06-cards-preview`.

| Swift test class | Tests | What |
| --- | --- | --- |
| `ZimArchiveTests` | 10 | open + metadata; same file → same archive; full-text + suggestions (`canberra`); cross-archive order; read HTML and a missing entry; plain-text sections (References dropped); the Android text rules on a synthetic page; only files in app storage open (`..`, missing, non-ZIM, fake ZIM); content root excluded from backup; concurrent searches |
| `CatalogHashTests` | 5 | the 9 committed catalog cases (ok, unknown_key, bad_signature, rollback, sequence_reuse); a flipped byte breaks the signature; fixture ZIMs equal their signed entries (whole file + 64 KiB chunks, progress); cancel; empty file |
| `SealingTests` | 11 | JS off; script handlers and user scripts refused and logged; the inline script does not run in the real page; **content blocker: a loopback listener sees the control web view connect and the sealed configuration never** (img, CSS, iframe, video over http and https); non-zim navigations reported; load entry points refuse non-zim (HTTP, file, data, POST); CSP on every response (200/404/403); blackout CSS after the CSP; path traversal (16 forms); non-persistent data, no fraud lookups, no link previews |

| Maestro flow (iOS Simulator) | Result |
| --- | --- |
| `startup/secure-storage-unavailable` (unsigned build) | Pass: "Secure storage unavailable", `Error code: ERR_SECURE_STORAGE_READ (ERR_KEY_CHAIN)`, Retry shows it again |
| `01-onboarding` | Pass: English, Greece, tier, both Wikipedia packs "installed" after the startup hash, disclaimer, home |
| `02-search-article` | Pass: suggestions, full-text, the first result in the sealed viewer, "Blocked requests: 0" |
| `03-ask-layer1` | Pass: Layer 1 excerpts with the "not verified advice" label, no AI summary (no model), an unrelated question has no source |
| `04-emergency-first` | Pass: CPR shows "Emergency? Call 112" and the card first ("Under professional review"); earthquake shows the number above Layer 1; no AI summary on emergency intent |
| `05-map` | Pass: "Map ready" from the verified `map-gr` PMTiles (style assets from the bundle via `asset://`) |
| `06-cards-preview` | Pass: 112, the card under review, no steps, no read-aloud |

**macOS (`desktop-macos`).** `cargo fmt --check`; `cargo clippy --workspace --all-targets --no-default-features --features desktop-core/metal,skepi-desktop/metal -D warnings`; `cargo test` (desktop-core 30 incl. the Keychain key and the sysctl/statvfs probes, catalog fixtures 1, Station over TLS 6, zim-ffi on the fixtures 5; inference 1 ignored: needs the GGUF); the Developer Preview UI scan; `tauri build --target aarch64-apple-darwin --bundles app,dmg --no-sign` (`SKEPI.app` and `SKEPI_0.1.0-preview_aarch64.dmg`, kept 7 days as a workflow artifact); `otool -L` lists only `/usr/lib` and `/System` libraries and no curl/microhttpd symbol is linked; the idle egress run (90 s): the app stays up, creates app.db with its key in the Keychain, and makes no connection outside loopback.

**Existing jobs and local checks.** Every existing job (verify, rag-eval-smoke, android-release-guards, desktop-windows) stayed green on every run. Locally: release APK (preview, release key) with `PREVIEW CARDS PASS 0/202`; Maestro on the Galaxy S23 (release, airplane mode) `onboarding`, `ask-en`, `cards`: **3/3**, blocked WebView requests 0, ContentStore requests 0, 0 bytes over real interfaces (the app.db key change also runs on Android); desktop Playwright 15/15.

## Found and fixed on the way

- **Blank screen when the secure storage fails (real bug, both phones).** The first Simulator run hung on a white screen: the unsigned build has no entitlements, the Keychain refused (errSecMissingEntitlement, -34018), `appDb()` rejected, the rejected promise stayed cached and the root layout waited forever. Now `@skepi/db` `loadOrCreateDatabaseKey` reads the key, or writes a new one and reads it back; any failure is a `SecureStorageError` (`ERR_SECURE_STORAGE_READ` / `_WRITE` with the native code, e.g. `ERR_KEY_CHAIN`, and the OSStatus when the message has one); a failed read never creates a new key; there is no fallback key store and no unencrypted database. The app shows "Secure storage unavailable", the code, the native message and Retry, and logs the code (never the key); a failed open is not cached. 8 unit tests with the error shapes of expo-secure-store on iOS (KeyChainException) and Android (Keystore and encrypt failures); the unsigned Simulator build is the end-to-end check.
- Metal on macOS: ggml-metal's `@available` checks need `__isPlatformVersionAtLeast` from clang's runtime, which the release link with `--target` did not pull in; the app's build script links `libclang_rt.osx.a` (only the members it needs).
- ccache was not used on iOS (Xcode 26 explicit modules bypass React Native's CC wrapper): Xcode's `C_COMPILER_LAUNCHER` now runs it. The first macOS Rust cache was saved by a run that stopped at clippy and a full key hit is never re-saved: new key.
- Test fixes: one loopback probe per web view in the content-blocker test (the control view kept connecting after a reset); the document title awaited after `didFinish`.

## Simulator signing (owner decision, 2026-10-11)

The Simulator's Keychain refuses an app with no entitlements, so an unsigned build cannot keep the app.db key.
The copy that Maestro installs is rebuilt with "Sign to Run Locally" (`CODE_SIGN_IDENTITY=-`, `CODE_SIGN_STYLE=Manual`,
empty `DEVELOPMENT_TEAM` and profile) and `e2e/ios/simulator-ci.entitlements` (`application-identifier`,
`keychain-access-groups`). No team, certificate, provisioning profile or secret; `codesign -dv` shows
`Signature=adhoc`, `TeamIdentifier=not set` (CI fails on a team identity); such a build runs only in the Simulator
and cannot be installed on a device. The checked Release build stays `CODE_SIGNING_ALLOWED=NO` and runs the failure flow.

## Skipped, and why

| Flow / check | Reason |
| --- | --- |
| Tools: SOS torch, compass, location fix, SMS hand-off | Hardware: the Simulator has no torch, compass or GNSS receiver |
| P2P share / receive, Station → iPhone | iOS has no LocalOnlyHotspot; `expo-transfer` reports "not supported on this platform" in this phase (no new iOS features); Share/Receive are hidden on iOS |
| Pack downloads (mirror E2E, onboarding downloads) | Not supported on iOS in this phase (`startDownload` rejects `ERR_CS_UNSUPPORTED`; background `URLSession` comes later); packs are provisioned or imported |
| AI summary, T1 simulation, bench, held-out and parity runs | Need the GGUF model and llama.rn on a device; no model is provisioned on the Simulator |
| Blackout battery simulation, energy meter | Android-only tools (`dumpsys battery`, battery current) |
| Airplane mode in the flows | Maestro cannot toggle it on iOS; this build has no code path to the network (downloads unsupported, no P2P) |
| Driven (non-idle) macOS egress, desktop smoke | `tauri-driver` does not support macOS (WKWebView has no WebDriver); the idle egress run is done |

## Pending a real device or Mac

- llama.rn with Metal and the GGUF model on an iPhone; the desktop Metal path with a model (CI has no model).
- GPS, compass and torch on hardware; the "while in use" location prompt.
- `pmtiles://file://` on a real iPhone (the Simulator renders it).
- Retrieval parity iPhone ↔ S23 ↔ desktop: CoreKiwix links full ICU data, the Android AAR does not.
- Keychain behaviour after an unsigned rebuild of the macOS app (the item's ACL names the old binary).
- Signing, notarisation, TestFlight, App Store review (GPL question in "Licences and legal").

## CI runs and timings

Main, after the merge of PR #2 (rebased; all jobs green in both runs):

| Run | Kind | ios-simulator | desktop-macos | Existing jobs |
| --- | --- | --- | --- | --- |
| [38167191548](https://github.com/Fiouri/skepi/actions/runs/38167191548) (push) | cold: first main run, no main caches (ccache, CocoaPods, Rust, packs, CoreKiwix) | 47 m 39 s | 29 m 20 s | verify 1 m 23 s · rag-eval-smoke 1 m 31 s · android-release-guards 14 m 12 s · desktop-windows 32 m 33 s (new Rust cache key: Cargo.lock gained the macOS-only crates) |
| [38170634902](https://github.com/Fiouri/skepi/actions/runs/38170634902) (workflow_dispatch) | warm | 34 m 51 s | 7 m 29 s | verify 1 m 12 s · rag-eval-smoke 1 m 19 s · android-release-guards 13 m 22 s · desktop-windows 4 m 46 s |

| Step | Cold | Warm |
| --- | --- | --- |
| iOS: CoreKiwix download + verify | 2 m 39 s | cache |
| iOS: `pod install` | 1 m 14 s | 53 s |
| iOS: `xcodebuild` Release (Simulator) | 14 m 27 s (ccache 0/676 hits) | 5 m 28 s (676/676 hits) |
| iOS: Swift unit tests (build + 26 tests) | 4 m 49 s | 5 m 22 s |
| iOS: ad-hoc Simulator copy for Maestro | 1 m 45 s | 1 m 28 s |
| iOS: Maestro (packs, 7 flows) | 19 m 11 s (packs downloaded, 972 MB) | 18 m 51 s (packs from cache; the flows and the first-start hash of the packs dominate) |
| macOS: clippy | 5 m 49 s | < 30 s |
| macOS: `cargo test` | 6 m 36 s | < 30 s |
| macOS: `tauri build` (app + dmg) | 9 m 47 s | 2 m 34 s |
| macOS: egress (idle 90 s) | 1 m 33 s | 1 m 33 s |

Iterations on the PR (all on `phase-3b0-apple-ci`): 38152805309 (macOS: dead constant on non-Windows; iOS: Swift circular reference), 38154347355 (Metal link: compiler-rt), 38156090024 (test-host CC path, test fixes; desktop-macos first green), 38158141683 (Swift 26/26; Maestro white screen → Keychain), 38162035127 (secure-storage fix + ad-hoc copy: Maestro 7/7; one flaky title assertion), 38165134459 (all green; ccache wired).

Cost note: the repository is public, so GitHub-hosted macOS minutes are not billed; on a private repository macOS minutes count 10× against the plan. The nightly run starts only the two Apple jobs (~42 min warm).
