# Phase 3a · Windows desktop (Tauri 2) with Station mode

Platform: Windows 11 x64 (test machine: RTX 4060 Ti 8 GB, 32 GB RAM). English-only until v1 (Greek frozen).
Design: `docs/architecture.md` ("Desktop", "Desktop Station mode", "Sealed article reading on the desktop");
threats: `docs/threat-model.md` ("Desktop app (Phase 3a)", "Station mode"). Evidence: `docs/phase3a/`.

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| Part A: persistent build cache | Done: `%LOCALAPPDATA%\skepi\cache` by default (`SKEPI_CACHE_DIR` overrides); `migrate-cache` moved 23 files / 5.06 GB from `%TEMP%\skepi`, each SHA-256 checked (`MIGRATED-SHA256SUMS.txt`) |
| Part A: deterministic GPS in E2E | Done: debug-only mock provider; Maestro **8/8 on the first run** on the S23 (airplane mode) |
| Desktop fully offline: search, articles, Layer 1 + AI summary with verified citations, map + POIs, place search, emergency cards with the draft banner | Done: `e2e/tauri-smoke.mjs` on the real debug and **release** builds, 21/21 checks each |
| IPC and network sealing proven by tests | Done: real WebView2 (smoke) + `viewer.rs`, `station_server.rs`, capability ACL |
| Desktop retrieval parity with Android and rag-eval | **108/108** desktop ↔ S23 directly, 108/108 desktop ↔ rag-eval both ways |
| Test-mirror downloads verify and install; tampered rejected | Done: `crates/desktop-core/tests/downloads.rs` (good; corrupt first mirror → fallback; corrupt everywhere → nothing installed; resume from the verified chunk; tampered and rollback catalogs rejected, sequence 4 adopted; unverified GGUF import refused) |
| Station: S23 release receives a pack, every chunk verified | Done: `wikipedia_en_medicine_mini` (155.3 MB), chunk 3/3 verified, SHA-256 `55153075…f358` |
| Station: a newer signed catalog propagates | Done on the debug app (test-key catalog 4 + `test-propagation`); release app correctly refuses the test-key catalog (`unknown_key`) — propagation to a **release** phone needs a release-key catalog (owner) |
| Desktop never serves unselected packs or user data | Done: host log 6/6 requests expected, 0 unexpected; `station_server.rs` 16 forbidden paths → 404 |
| Zero egress offline | App process: 0 connections; webviews: only `tauri/ipc/zim/maps.localhost`. Online too, after the follow-up: no connection outside loopback from the whole process tree, idle and in use (see "WebView2 egress") |

## Part A

1. **Build cache.** `tools/catalog-builder/src/paths.ts` (`defaultCacheDir`, `resolveCacheDir`, `migrateDir`):
   same-volume rename or copy + verify, legacy directory removed only after every hash matched. Used by
   catalog-builder, rag-eval, `scripts/provision.ps1`, `e2e/run-p2p.ps1`. README documents it.
2. **Mock GPS.** `modules/expo-emergency-tools/android/src/debug/.../MockLocation.kt` reads
   `files/e2e/mock-location.json` (written by `e2e/run-e2e.ps1 -MockLocation`); the `release` source set
   has a no-op. The fix is used only after the permission and GPS-enabled checks pass, so those code paths
   stay real. `MockLocationTest` (instrumentation). `tools.yaml` runs on the debug app; egress is checked
   for both UIDs.

## Part B

1. **UI** (`apps/desktop`, React 19 + Vite 8): uses `@skepi/core`, `contracts`, `i18n`, `ui-tokens`
   unchanged. `src/lib/adapters.ts` implements KnowledgeEngine, InferenceEngine, ContentStore and
   DeviceProfile over 30 narrow commands; `src/lib/ipc.ts` is the only native caller (ESLint-enforced).
   Tier: `detectDesktopTier` / `resolveDesktopProfile` (T3 on ≥ 4 GB discrete VRAM or ≥ 15,000 MB RAM).
2. **libzim** (`crates/zim-ffi`): cxx over the official Kiwix Windows build of libzim **9.7.0** (same
   version as Android), pinned in `native/kiwix/libzim-windows.lock.json` (archive SHA-256 + every file);
   `fetch-libzim-windows.ps1`; `build.rs` re-checks the hashes.
3. **llama.cpp** in-process (`llama-cpp-2` 0.1.159): Vulkan on the discrete GPU, CPU fallback, no HTTP
   server; prompts, JSON-schema grammar and validation are the mobile ones (`@skepi/core`). Measured
   (release, Qwen2.5-1.5B Q4_0, RTX 4060 Ti): TTFT 71 ms, 32.9 tok/s, KV prefix reuse.
4. **Sealed viewer:** separate `viewer` window over `zim`; no capability, JavaScript off, CSP with
   `sandbox`, incognito, navigation/new windows/downloads denied. Proven in the real WebView2 with the
   CC0 sealing fixture (inline script did not run, `invoke` denied for the window, IPC fetch blocked,
   remote/file images blocked, local image served, external link cancelled → shown as text).
5. **Maps:** MapLibre GL JS 5.24.0 + pmtiles 4.5.0 over the `maps` protocol (Range → 206), bundled
   style/glyphs/sprites (SHA-checked copy from the mobile assets), POI layer, place search.
6. **Storage:** rusqlite 0.40.2 + SQLCipher; key DPAPI-protected; migrations from
   `packages/db/migrations.json` (staleness test); user-chosen content folder (native picker; drives and
   USB sticks).
7. **ContentStore** (`download.rs`, `content.rs`): Range resume, per-chunk SHA-256, atomic install,
   signed catalog + anti-rollback (Rust port of `core/catalog.ts`; both checked against
   `catalog/verification-expectations.json`, 9 cases), import refuses unverified GGUF. The only internet
   code on the desktop.
8. **Station mode** (`crates/desktop-core/src/station`): expo-transfer protocol, 32 connections, idle
   stop (30 min), selected packs only, optional APK page with the signing-certificate fingerprint,
   firewall explanation on the Station screen.
9. **Capabilities:** `main` window only; 30 `allow-*` command permissions + event listen; no shell/fs/http
   plugins; CSP; no remote URLs.
10. **Installers** (`npx tauri build`, unsigned, no updater):
    - `SKEPI_0.1.0_x64_en-US.msi` 38.4 MiB, SHA-256 `510f8b80de1347f26a09c04bf6dd70cbdd9e8d1eac099b987582fcf1feeb03f4`
    - `SKEPI_0.1.0_x64-setup.exe` (NSIS) 22.3 MiB, SHA-256 `cf1a8d18586cc5476b7fd5ed9b2a9883a6dd5ab92791ed0ea7343605e28bb1e9`
    - NSIS silent install per-user → app starts (window "SKEPI") with the bundled libzim/ICU/VC runtime
      DLLs → silent uninstall. **SmartScreen** shows "Windows protected your PC" on unsigned installers
      until a code-signing certificate is used; users should check the SHA-256 above.

## Station E2E (desktop → S23)

`e2e/run-station.ps1`: the desktop host (`apps/desktop/e2e/station-host.mjs` drives the real debug app
over tauri-driver) serves `wikipedia_en_medicine_mini` and `test-propagation`; the phone types the
pairing code (same JSON as the QR).

- **Release app** (`org.skepi.app`): catalog of the desktop refused (`unknown_key`: test-key catalog),
  medicine pack "Verified by the signed catalog", received, chunk 3/3 verified, file SHA-256 matches;
  `test-propagation` offered as "Unverified — not in the signed catalog" and not selected.
- **Debug app** (`org.skepi.app.dev`, `pm clear`): accepted catalog 4 from the desktop and received
  `test-propagation` (known only to the newer catalog), verified.
- Desktop log: 1 phone, 6 requests (`/manifest`, `/pack/<selected id>`), 0 unexpected.
- Findings fixed: Android refused to bind the P2P socket to Wi-Fi with a VPN active (EPERM) → fallback
  to normal routing (`TransferClient.newSocket`); Windows added inbound **Block** rules when the first
  firewall prompt was dismissed on a Public network → explained in the app and in the threat model; the
  first flow version tapped the unverified offer on the release phone (selecting it) → now asserted only.

## Verification

| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | pass |
| Unit tests (vitest) | core 298, db 17, i18n 14, ui-tokens 36, emergency-cards 35, catalog-builder 30, rag-eval 11, release-guards 6, desktop 4 — all pass |
| `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings` (default and `--no-default-features`) | pass |
| `cargo test --workspace` | pass (zim-ffi 5, desktop-core 30 + catalog fixtures + Station 6 + mirror downloads; inference `--ignored` on Vulkan pass) |
| rag-eval full (English, 132 + 11 held-out) | **PASS**: citation precision 93.2%, unsupported shown 0, refusal 100%, number/unit violations 0, summary coverage 72.4% |
| rag-eval smoke subset (CI) | PASS |
| Parity | S23 ↔ rag-eval 108/108; desktop ↔ S23 108/108; desktop ↔ rag-eval 108/108 both ways (`docs/phase3a/parity`) |
| `npx tauri build` | MSI + NSIS (above) |
| Playwright (mocked commands) | 10/10 |
| tauri-driver smoke | debug 21/21, release 21/21 (`docs/phase3a/desktop-smoke*`) |
| Android `assembleRelease` | 50.1 MB, signing SHA-256 `7d61c382…` (release key), permission allowlist PASS |
| `connectedAndroidTest` (S23) | 35 passed, 0 failed |
| Maestro on the S23, airplane mode | 8/8 first run; blocked WebView requests 0, ContentStore requests 0, bytes 0, SMS intents 1 (`docs/phase3a/e2e-s23`) |
| Station E2E desktop → S23 | PASS |
| Egress online, release app idle + in use (`egress.mjs --expect-none`) | PASS: no connection outside loopback (before the follow-up: `substrate.office.com` at start) |

CI: new `desktop-windows` job: libzim fetch with SHA-256; LunarG Vulkan SDK 1.4.363.0 pinned by SHA-256
(`native/vulkan`, equal to LunarG's published hash), installed unattended and pruned to the ~40 MB that
ggml-vulkan's build uses, cached by the lock file; UI build; fmt; clippy for the Vulkan build and the
CPU-only build (`--no-default-features`, which now really drops Vulkan: the Tauri crate forwards the
`vulkan` feature); tests on the Vulkan build; a CPU-only build; mirror download test. The first CI run
failed because `--no-default-features` did not reach `desktop-core` through the Tauri crate and the
runner had no Vulkan SDK.

## Build setup (Windows)

`scripts/with-msvc.ps1` loads vcvars64 (VS 2019 Build Tools 14.29) and, when no Windows SDK is installed,
uses Microsoft's NuGet packages (no admin), Ninja for CMake, and portable Strawberry Perl (SQLCipher's
vendored OpenSSL). It also names the SDK `rc.exe` (npx puts the npm package `rc` first on PATH, which
broke llama.cpp's CMake compiler check in release builds) and uses Ninja for CMake whenever available
(with an installed SDK, the VS 2019 MSBuild generator failed in ggml-vulkan's shader-generator
sub-build). Vulkan SDK: `native/vulkan/fetch-vulkan-sdk.ps1`. Tools in `%LOCALAPPDATA%\skepi\tools`
(SHA-256 of the downloads):

| Tool | SHA-256 |
| --- | --- |
| Microsoft.Windows.SDK.CPP 10.0.26100.9169 (NuGet) | `475269434…` |
| Microsoft.Windows.SDK.CPP.x64 10.0.26100.9169 (NuGet) | `df6226a05…` |
| Strawberry Perl 5.42.3.1 portable | `6a081a81…` |
| Ninja 1.13.2 | `07fc8261…` |
| msedgedriver 154.0.4258.62 (tauri-driver) | `c99f91b6…` |

## WebView2 egress (follow-up)

WebView2 Runtime 154.0.4258.62, release build, online, `egress.mjs` (`docs/phase3a/egress`):

| | Before | After |
| --- | --- | --- |
| Arguments | `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-networking --disable-component-update --disable-domain-reliability --no-pings` | + `msOneAuthWAM,msLoadOneAuthInBackground,msEdgeOSAccountInfoSubstrate` in `--disable-features`; `IsReputationCheckingRequired = false` on every webview (WebView2 API) |
| Idle (0–120 s) | browser process → `substrate.office.com:443` (4 TLS connections, from ~4 s to ~110 s) | none |
| In use (search, viewer, Ask/AI, map, places, cards, library, settings) | none | none |
| Idle after use (60 s) | none | none |
| UDP | none | none |

The connection was the runtime's Microsoft-account integration (OneAuth over WAM, WinHTTP, so not in
the Chromium net log; host named from the Windows DNS cache: `substrate.office.com` →
`outlook.cloud.microsoft`). Experiments with the same binary: `msOneAuthWAM` alone removes it; the
other identity flags alone do not. What cannot be switched off by the app (IPv6 reachability probe
without packets, runtime updates by Edge Update, overrides by `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` or
admin policy, undocumented flag names) is listed in `docs/threat-model.md`, "WebView2 runtime egress".
`egress.mjs --expect-none` is the gate for every release and runtime upgrade.

## CI results (GitHub Actions)

`desktop-windows` reached green after four fixes; durations per job (minutes):

| Run | verify | rag-eval-smoke | android-release-guards | desktop-windows | Cause / fix |
| --- | --- | --- | --- | --- | --- |
| 37925617904 | ✅ 1.2 | ✅ 1.6 | ✅ 41.5 | ❌ 11.9 | No Vulkan SDK; `--no-default-features` did not reach `desktop-core` through the Tauri crate → pinned SDK (`native/vulkan`), `vulkan` feature forwarded |
| 37948561448 | ✅ 1.5 | ✅ 1.3 | ✅ 36.0 | ❌ 8.6 | ggml-vulkan's shader-generator sub-build fails under the Visual Studio 18 generator → cargo through `with-msvc.ps1` with Ninja |
| 37953252531 | ✅ 1.0 | ✅ 1.5 | ✅ 41.0 | ❌ 2.4 | pwsh drops an unquoted `--` when calling a script (`unexpected argument '-D'`) → `'--'` |
| 37958420170 | ✅ 0.9 | ✅ 2.7 | ✅ 40.1 | ❌ 52.3 | `e2e/fixtures/p2p-propagation.zim` never committed (`*.zim` ignored) although the test catalogs pin it → committed; `catalog check-fixtures` now guards this |
| 37964981477 #1 (cold cache) | ✅ 1.1 | ✅ 1.7 | ✅ 39.5 | ✅ 54.2 | Swatinem/rust-cache added (llama.cpp CPU + Vulkan build output) |
| 37964981477 #2 (warm cache) | ✅ 1.1 | ✅ 1.7 | ✅ 38.2 | ✅ **5.3** | rust-cache hit; Vulkan SDK from cache |

Warm `desktop-windows` steps: Vulkan clippy 47 s, CPU-only clippy 7 s, tests 50 s, CPU-only build 24 s,
mirror test 17 s (cold: 16 min, 3.5 min, 17 min, 4 min, 7 min). The whole run is then bounded by
`android-release-guards` (~38–41 min, mostly llama.rn's native build), which the next CI change caches
(Gradle build cache + ccache), together with a path filter: docs-only changes run `verify` only.

## Deviations and open items

- **Release catalog propagation:** a release phone accepts only release-key catalogs; propagation was
  shown on the debug app with the test key. Needs the owner to sign a release catalog with sequence ≥ 3
  (key offline, `tools/catalog-builder/README.md`).
- **WebView2 runtime egress — fixed (follow-up):** the first measurement attributed the runtime's
  connections loosely; `apps/desktop/e2e/egress.mjs` now measures the real release app online (direct
  start with its own arguments, 120 s idle, use through UI Automation, 60 s idle, ~0.5 s sampling of
  the process tree). See "WebView2 egress" below.
- **Unsigned installers:** SmartScreen warning until code signing.
- **`freezePrototype` off:** it broke a bundled library; accepted because no remote script can run.
- macOS desktop: later phase.
