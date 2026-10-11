# Phase 3b-0 · Apple builds in CI (no Mac, no signing)

Goal: every Apple-specific line compiles and runs at least once in CI on GitHub's macOS runners, so iOS
and macOS work can continue without a Mac. No signing, no TestFlight, no store work. Design:
`docs/architecture.md` ("Apple builds (Phase 3b-0)"). Pins: `native/kiwix/corekiwix.lock.json`.

Runner: `macos-latest` (Apple silicon) = macOS 26.6.2, Xcode 26.6, iOS Simulator 26.5 (iPhone 17).

## Acceptance criteria

<!-- RESULTS -->

## What compiles

| Area | iOS (Simulator, Release, unsigned) | macOS desktop (aarch64, release, unsigned) |
| --- | --- | --- |
| libzim 9.7.0 | `SkepiZim` pod: Objective-C++ shim (`SKZArchive`) over the iOS slices of CoreKiwix.xcframework 14.2.1-2 | `crates/zim-ffi`: the existing cxx shim over the macOS slice of the same xcframework, thinned with `lipo` and linked statically |
| Article viewer | `SealedWebView` (WKWebView): `zim://` scheme handler, content rule list, page JavaScript off, no script message handlers or user scripts, non-persistent data, no fraud lookups or link previews, CSP header + meta on every response, blackout CSS | Tauri viewer window over the `zim` protocol (`zim://localhost` on WKWebView), JavaScript off, incognito, no IPC capability |
| Inference | llama.rn built from source (`RNLLAMA_BUILD_FROM_SOURCE=1`) | llama.cpp with Metal (`metal` feature) |
| Other native code | `expo-hash` (SkepiHash, CryptoKit), `expo-content-store` (local, embedded catalog, import), `expo-device-profile`, `expo-emergency-tools`, `expo-transfer` (unsupported) | Keychain app.db key, sysctl/statvfs probes, `getifaddrs` Station addresses |
| Third-party native | React Native 0.86 / Expo 57 (prebuilt RN core as in Expo's template), MapLibre (Swift package), op-sqlite with SQLCipher | Tauri 2.12, rusqlite with vendored SQLCipher/OpenSSL, rustls |

## What runs in CI

<!-- RUNS -->

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
- `pmtiles://file://` on a real iPhone (the Simulator renders it; architecture listed the device test as open).
- Retrieval parity iPhone ↔ S23 ↔ desktop: CoreKiwix links full ICU data, the Android AAR does not.
- Keychain behaviour after an unsigned rebuild of the macOS app (the item's ACL names the old binary).
- Signing, notarisation, TestFlight, App Store review (GPL question in "Licences and legal").

## CI timings

<!-- TIMINGS -->
