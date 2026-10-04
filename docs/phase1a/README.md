# Phase 1a · Foundation and security hardening (Android)

Date: 2026-10-04 · Device: Galaxy S23 (SM-S911B, Android 16, T2) · Build: `./gradlew assembleRelease`, arm64-v8a

## Release signing

- Release APKs are signed with the SKEPI keystore (`docs/release-signing.md`); a build without the four
  `SKEPI_RELEASE_*` properties fails at `:app:skepiCheckReleaseSigning` before compiling.
- `apksigner verify --print-certs` on the release APK:
  `CN=Any WeCon, OU=Any WeCon, O=Any WeCon, L=Patra, ST=Western Greece, C=GR`,
  SHA-256 `7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e` (not the Expo debug certificate).
  Publish this fingerprint with the first public release.
- Debug builds install side-by-side: `org.skepi.app.dev` ("SKEPI Dev", Expo debug key); release stays `org.skepi.app`.
- Release permissions: `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` (from libraries) and the app's own
  `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. **No INTERNET.**

## R8

| Build (arm64 release APK) | APK | Dex (raw) | Dex (in APK) |
| --- | --- | --- | --- |
| Phase 0 final (no R8) | 55.3 MB | 42.4 MB | 15.1 MB |
| Phase 1a, R8 off (`-Pandroid.enableMinifyInReleaseBuilds=false`) | 54.4 MB | 42.4 MB | 15.1 MB |
| **Phase 1a, R8 on** | **45.9 MB** | **16.5 MB** | **6.6 MB** |

After R8, search, article, AI answer with citations, cited article, no-source path and map all pass on
the device (Maestro below). Keep rules: `apps/mobile/plugins/proguard-rules.skepi.pro`.

## Viewer sealing instrumentation tests

`./gradlew :expo-zim:connectedAndroidTest` on the S23: **11 tests, 0 failures, 0 skipped**
(`modules/expo-zim/android/src/androidTest`). They found one real bug: a missing ZIM entry raised a plain
`java.lang.Exception` from libkiwix, which escaped the WebView interceptor instead of returning 404. Fixed.

## E2E (Maestro, airplane mode, release build)

`e2e/run-spike.ps1`: English flow (search → article → answer `[S1] [S2]` → cited article → no source →
map) **passed**; Greek UI flow (app locale el-GR) **passed**; **0 blocked WebView requests**.

## Bench: normal vs T1-simulation

Raw JSON: [`bench-normal.json`](bench-normal.json), [`bench-t1-simulation.json`](bench-t1-simulation.json) (schema 2, `mode` recorded).

| | Normal | T1-simulation |
| --- | --- | --- |
| Tier (detected → applied) | T2 → T2 | T2 → T1 |
| Model | Qwen2.5-1.5B Q4_K_M | Qwen2.5-1.5B **Q4_0** |
| Threads | 5, pinned to performance cores | **2, unpinned** |
| n_ctx / budget | 2048 / 800 tokens | 2048 / 800 tokens |
| Suggest p95 | 14.7 ms | 15.7 ms |
| Full-text p95 | 7.5 ms | 9.1 ms |
| Article HTML p95 | 8.8 ms | 12.4 ms |
| Model load | 1.9 s | 0.8 s |
| First token (1175-token prompt) | 14.7 s (gate T2 < 15 s ✓; an earlier run measured 16.0 s) | 16.9 s (T1 target pending) |
| Decode | 17.7 tok/s | 12.2 tok/s |
| Citations | S1, S2 | S1 |

The T2 first-token result sits right at the 15 s gate and varies between runs; the Phase 1 latency work
(Layer 1 extractive answers, shorter prompt, KV-cache reuse) remains necessary.
