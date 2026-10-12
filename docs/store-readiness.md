# Store readiness — Android (F-Droid and Google Play)

Part 1 (2026-10-12, audited commit `a1681ca`): research only. Part 2 (2026-10-12, below): owner
decisions and the build changes they need. Nothing was submitted and no account was touched in either
part; the release signing config is unchanged.

**Decisions (owner, 2026-10-12)**

- **F-Droid first.** Google Play is deferred to v1; the account type (B4/B5), Play App Signing (B8), IARC
  (§9) and the Health declaration (B4) are decided then. Recorded in `docs/architecture.md`
  (distribution).
- **The signing key never enters CI or the project's Gradle properties** (unchanged). CI builds unsigned;
  the maintainer signs the reproducible CI artifact locally (`docs/release-process.md`).

**Part 2 result:** B1, B2, B3 and B6 are done (§1); the reproducible unsigned APK comes from the
`android-repro` CI job; the fdroiddata recipe is updated and linted (§6); AAB and screenshots are done
(§5). Verification at `bbd53be`: `pnpm verify` 46/46; Rust `fmt`, `clippy -D warnings`, `test` (local and
CI `desktop-windows`); signed preview `assembleRelease` (certificate `7d61c382…447e`); Maestro on the S23
in airplane mode 8/8 (problem report CHOOSER intent 1, SMS hand-off 1, 0 bytes over real interfaces,
0 blocked WebView requests); `android-repro` green (run 38301432599).

Status legend: **ready** · **blocked** (a repo change is needed first) · **owner** (needs an owner
decision or account action).

## 1. Findings that block or shape a submission

| # | Finding | Store | Status | Proposal |
| --- | --- | --- | --- | --- |
| B1 | A release build cannot be produced **unsigned**: without the four `SKEPI_RELEASE_*` properties it fails (`skepiCheckReleaseSigning`), and the only escape hatch signs with the debug key. F-Droid builds an unsigned APK and then either signs it or copies the upstream signature onto it. | F-Droid | **done** | `-PskepiUnsigned=true` in `withReleaseSigning.js`: release `signingConfig null`, a loud warning, exclusive with `-PskepiDebugSign`; without it the build stays fail-closed and the signed path is unchanged. Output `app-arm64-v8a-release-unsigned.apk`; CI builds only unsigned. |
| B2 | Expo modules are linked as **prebuilt AARs** from `node_modules/*/local-maven-repo` (11 `host.exp.exponent:*` artifacts on the release classpath). F-Droid requires binaries built from source (or from an allowed repository); `node_modules` is not one. | F-Droid | **done** | `buildFromSource: [".*"]` in `apps/mobile/package.json`, every build. `releaseRuntimeClasspath` before/after: the 15 prebuilt Expo artifacts (11 `host.exp.exponent:*`, 4 `expo.modules.*`) became the 15 `project :expo-*` modules of the same versions; the other 375 entries (all third-party Maven modules) are unchanged. |
| B3 | Release APKs are **not reproducible across checkout paths**: 18 of 1349 entries differ, all native libraries built in the build (build-id, absolute `__FILE__` paths, one link-order difference). Java/Kotlin, resources and the JS bundle are identical (§4). | F-Droid (reproducible, our signature) | **done** | `plugins/reproducible.cmake` for every CMake build (`--build-id=none`, `-ffile-prefix-map`; Reanimated without ThinLTO); two clean builds in different paths are byte-identical, locally and in CI (`android-repro`, §4). |
| B4 | The Health apps declaration must be accurate: SKEPI ships medical reference content (WikiMed packs) and emergency cards/numbers, i.e. the **Medical** group ("Medical Reference and Education", "Emergency and First Aid"). Play Console requirements list "Health apps, such as Medical apps" among the services that must register as an **Organization** account (D-U-N-S number). | Play | deferred (v1) | Decide the account type before creating it. A personal account would have to declare no health features, which would be inaccurate. Verify the exact trigger in Play Console when registering. |
| B5 | New **personal** accounts (created after 2023-11-13) must run a closed test with ≥ 12 testers opted in for 14 consecutive days before production access. | Play | deferred (v1) | Only if a personal account is chosen (see B4). Recruit 12 testers (e.g. from the GitHub preview) before the first upload. |
| B6 | **AI-Generated Content** policy: apps that generate content from user prompts must let users report offensive content "to developers without needing to exit the app". "Report a problem with this answer" only copied or saved text. | Play | **done** | The panel takes the user's text; "Send…" hands the report (question, what was shown, sources, app version, the user's text) to the system share sheet (`Share.share` → `ACTION_SEND` chooser, subject "Problem report (SKEPI <version> (Android))"). No permission, no network; the hint names github.com/Fiouri/skepi/issues. Unit tests (`packages/core/test/report.test.ts`), Maestro step in `ask-en.yaml` + CHOOSER intent check in `run-e2e.ps1`. |
| B7 | Play delivers split APKs from an AAB. The app already refuses to share itself from a split install (`ERR_P2P_APK`), so "share the app" does not work in the Play build; packs still share. | Play | ready (documented) | Mention in the Play listing or the share screen later; no change needed for submission. |
| B8 | **Play App Signing** is mandatory for new apps. If Google generates the app signing key, Play installs carry a different certificate than GitHub/F-Droid builds: users cannot move between channels without uninstalling, and the fingerprint in About (`ANDROID_RELEASE_SIGNING_SHA256`) and the Station check would not match the Play install. | Play | deferred (v1) | Proposal unchanged: upload the existing SKEPI release key to Play App Signing (PEPK export) so every channel shares one certificate, with a separate upload key. Google then holds a copy of the key: owner decision at v1. |
| B9 | **Android developer verification**: from 2026-09-30 certified devices in Brazil, Indonesia, Singapore and Thailand install only apps from verified developers; global in 2027. This covers the GitHub APK and F-Droid installs too. | All | owner (roadmap, before 2027) | Register `org.skepi.app` and its signing certificate (Play Console registers Play apps and can register apps distributed outside Play). F-Droid publicly opposes the programme; a reproducible build (F-Droid publishing our signed APK) keeps one registered certificate. |

No Google Play Services, Firebase, analytics, ads or other proprietary SDK was found (§3). No
`fdroid` flavor is needed for dependencies; B1–B3 are build changes for all channels, not a flavor.

## 2. Checklist per store

### F-Droid

| Item | Status | Evidence / note |
| --- | --- | --- |
| FOSS licence | ready | GPL-3.0-or-later (`LICENSE`); all runtime dependencies are FOSS (§3) |
| No non-free dependencies (Play Services, Firebase, tracking, ads) | ready | Release runtime classpath audit (§3): none |
| Binary dependencies from source or allowed repositories | ready | Expo modules from source (B2); the rest are freely licensed Maven Central / Google Maven AARs (§3). `fdroid scanner` on the unsigned APK: no known non-free classes, no extra signing blocks |
| Prebuilt files in `node_modules` that the build does not use | ready with recipe | `scandelete`: `llama.rn/bin` (Qualcomm HTP + `libOpenCL.so`; the Gradle plugin disables `syncRNLlamaHtpAssets` and excludes the Hexagon variant), `@op-engineering/op-sqlite/android/src/main/{jniLibs,libsqlitevec,tursoLibs}` (libsql/turso/sqlite-vec, not packaged: SQLCipher mode). `scanignore`: `hermes-compiler` (Hermes is an allowed prebuilt). Install only what the Android build runs (`pnpm install --frozen-lockfile --filter @skepi/mobile... --filter @skepi/catalog-builder... --filter @skepi/release-guards... --filter @skepi/emergency-cards...`: Gradle runs the catalog, card and bundle checks with `tsx`) so `tools/rag-eval`'s `node-llama-cpp` binaries are never fetched; untested |
| llama.cpp native code | ready | Compiled from source (`rnllamaBuildFromSource=true`); APK has only the 3 CPU variants built by CMake |
| Toolchain on the Debian buildserver | ready with recipe | Node ≥ 22 required (`engines`); Debian trixie ships 20.19, forky ships 24.x (`apt-get install -t forky nodejs npm`, as other React Native recipes do); pnpm is not in Debian: `npm install -g pnpm@10.33.0`. JDK 17. NDK `27.1.12297006` and `27.3.13750724`; CMake from the SDK (the Windows-only CMake 3.31.6 rule does not run on Linux) |
| Unsigned release build | ready | `-PskepiUnsigned=true` (B1) |
| Reproducible build (publish our signed APK via `Binaries:` + `AllowedAPKSigningKeys:`) | ready (buildserver untested) | Byte-identical across paths, Gradle homes and runners (§4). Open: the buildserver's JDK (§6) |
| Anti-features | ready | None expected: no tracking, ads or non-free assets; content hosts (Kiwix, Hugging Face, GitHub) serve freely licensed files, and every pack can also come from import or P2P, so the app does not "depend entirely" on a non-free service (NonFreeNet). Disclose the download hosts in the submission |
| Metadata | ready | `fastlane/metadata/android/en-US/` (title, short and full description, `changelogs/2.txt`, 6 phone screenshots); icon and feature graphic still to add (§5) |
| Version scheme | ready | Tags `v<version>`, versionCode in `apps/mobile/app.json` (2 for `v0.1.0-preview`); a recipe pins the full commit hash |
| fdroiddata recipe | owner | `docs/fdroid/org.skepi.app.yml` (§6), `fdroid lint` clean; submission is an owner action (GitLab merge request) |

### Google Play (deferred to v1)

Kept for v1; only the AAB and B6 changed in part 2.

| Item | Status | Evidence / note |
| --- | --- | --- |
| Target API level | ready | targetSdk 36 (`aapt2 dump badging`); required ≥ 36 for new apps and updates since 2026-08-31 |
| 16 KB page size | ready | All 39 native libraries have 16 KB (`0x4000`) LOAD alignment (`llvm-readelf`), `zipalign -c -P 16` passes |
| 64-bit | ready | arm64-v8a only (ABI split); no 32-bit code |
| AAB | ready | `bundleRelease -PskepiUnsigned=true` builds an arm64-only AAB (90.7 MB). Found and fixed on the way: ABI splits do not apply to bundles, so the AAB carried armeabi-v7a/x86/x86_64 copies of 20 prebuilt libraries (React Native, Hermes, libzim, MapLibre, …) without the app's own native code, and Play would have served those devices a crashing split; bundle tasks now turn the split off and filter to arm64-v8a (APK builds unchanged). bundletool 1.18.3: `validate`, `build-apks` (debug key, for the test only), `install-apks` on the `skepi-host` emulator (base + `arm64_v8a` + `xxhdpi` splits). Maestro on that install, airplane mode: `store-screenshots.yaml` (home, search, article, Ask with sources, map, tools), `cards.yaml`, `places.yaml` pass, 0 blocked WebView requests, 0 bytes over real interfaces; `onboarding.yaml` stops at its S23-specific tier assertion (`onboarding-tier-T2`; the emulator has 2 GB RAM). Not installed on the S23 (it would replace the release install and its data) |
| Developer account type, closed test | owner | B4, B5 |
| Play App Signing key | owner | B8 |
| Privacy policy URL | owner | `docs/privacy-policy.md`; public URL: `https://github.com/Fiouri/skepi/blob/main/docs/privacy-policy.md` (repo is public) or GitHub Pages (not enabled; owner) |
| Data safety form | ready | Answers in §7 |
| Health apps declaration | owner | B4: declare Medical → Medical Reference and Education, Emergency and First Aid; description carries the required disclaimer |
| Health Content and Services policy | ready | Listing says "not a medical device and does not diagnose, treat, cure, or prevent any medical condition" and to consult a healthcare professional; no medical claims; "not for emergency use" |
| AI-Generated Content policy | ready | B6 (share sheet) |
| Permissions | ready | None needs a Play declaration form (§8) |
| Content downloaded after install | ready | Packs are data (ZIM, GGUF weights, PMTiles, SQLite); no dex/JAR/`.so` is downloaded; ZIM JavaScript is never run (sealed viewer). The Device and Network Abuse policy forbids downloading executable code only |
| Self-update / installing APKs | ready | No self-update, no `REQUEST_INSTALL_PACKAGES`; the APK share page is disabled on split (Play) installs (B7) |
| Content rating (IARC) | owner | Suggested answers in §9 |
| Target audience | owner | Suggest 18+ for the Developer Preview (medical content, AI summaries; keeps the app out of the Families policy) |
| Ads declaration | ready | No ads |
| Store listing text | ready | `fastlane/metadata/android/en-US/` (title 30/30, short 80/80, full 3145/4000 characters); graphics still to add (§5) |
| Developer verification | owner | B9 (roadmap, before 2027) |

## 3. Dependency audit (release runtime classpath)

`gradlew :app:dependencies --configuration releaseRuntimeClasspath` at `a1681ca`: 213 modules.
Search for `com.google.android.gms`, `com.google.firebase`, `com.google.android.play`, `com.google.mlkit`,
`installreferrer`, analytics/crash SDKs, Huawei HMS: **no match**. The only `com.google.*` modules are
open-source libraries (Material Components, Guava, Gson, ZXing core, Error Prone and JSR-305 annotations,
AutoValue annotations). The QR scanner uses CameraX + ZXing (no ML Kit); location uses the platform GPS
provider (no fused location).

Prebuilt native code in the release APK (39 libraries) and its origin:

| Library | Origin | Licence | F-Droid view |
| --- | --- | --- | --- |
| `libkiwix.so`, `libzim.so` (+ wrappers) | `org.kiwix:libkiwix:2.6.0`, Maven Central (official Kiwix build) | GPL-3.0 / GPL-2.0+ | allowed repository, FOSS |
| `libmaplibre.so` | `org.maplibre.gl:android-sdk-opengl:13.6.1`, Maven Central | BSD-2-Clause | allowed repository, FOSS |
| `libcrypto.so` (SQLCipher's OpenSSL) | `io.github.ronickg:openssl:3.3.2-1`, Maven Central | Apache-2.0 | allowed repository, FOSS; reviewers may ask for a source build |
| `libreactnative.so`, `libhermesvm.so`, `libjsi.so`, `libfbjni.so`, Fresco image libraries | `com.facebook.react:react-android`, `hermes-android`, Fresco, Maven Central | MIT | allowed (Hermes named in the inclusion policy) |
| `libzstd-kmp.so`, CameraX JNI, `libandroidx.graphics.path.so` | Maven Central / Google Maven | Apache-2.0 | allowed |
| `librnllama*.so` | llama.cpp compiled from source in the build | MIT | source-built |
| `libop-sqlite.so`, `libexpo-modules-core.so`, `libappmodules.so`, `libreanimated.so`, `libworklets.so`, screens/gesture-handler/codegen libraries | compiled from source in the build | MIT | source-built |

## 4. Reproducible build

**Result (part 2): reproducible.** Every CMake build loads `apps/mobile/plugins/reproducible.cmake`
(`CMAKE_PROJECT_INCLUDE`): `-Wl,--build-id=none`, `-ffile-prefix-map` for the checkout, the Gradle user
home and the NDK, and Reanimated without ThinLTO. Two more sources of difference were found and fixed
along the way:

| Difference | Cause | Fix |
| --- | --- | --- |
| `libappmodules` + 3 codegen libraries kept Gradle-home paths | React Native's root plugin evaluates `:app` before the root build script ends, so the root `subprojects` block never reached the app module | `app/build.gradle` sets the same CMake arguments itself (`withSkepiAndroid.js`) |
| `libreanimated.so`: same strings, different order of RTTI names and code | Reanimated compiles with `-flto=thin`; ThinLTO identifies modules by object file path, and CMake names the objects of sources outside the project directory (`../Common/cpp`) after their absolute path | `-fno-lto` for the Reanimated project only (+64 KB APK) |
| `resources.arsc` (CI only: two runners) | The React Native Gradle plugin writes the build host's first IPv4 address into `react_native_dev_server_ip` | `reactNativeDevServerIp=localhost` in `gradle.properties` |

| Run | Setup | Result |
| --- | --- | --- |
| Local (Windows 11, JDK 17.0.19) | Two clean clones of `8ef52ff`'s tree at `%TEMP%/skepi/rb2/a` and `…/build-bb`, separate Gradle user homes (`~/.gradle`, `…/gh-b`), `--no-build-cache`, built in parallel (41.5 and 46 min) | Before the app/Reanimated fixes: 5 entries differed (above); after them: **byte-identical**, SHA-256 `a662186075ff72d1…c791` |
| CI run 38295601966 (`8ef52ff`) | `android-repro`: two Ubuntu 24.04 runners, checkouts `a` and `build-bb/second-checkout`, Gradle homes `~/.gradle` and `~/gradle-home-bb`, no build cache, no ccache | All 1348 other entries identical, including every native library; `resources.arsc` differed (dev-server IP) |
| CI run 38301432599 (`bbd53be`, main) | same | **byte-identical**: SHA-256 `5f166f8071bd52ac810c1c9ab2d0324cbf8e8305ef2f0c9c722df51b2453d17c` (`skepi-0.1.0-preview-arm64-unsigned.apk`, artifact `skepi-0.1.0-preview-vc2-bbd53bedcdaf-unsigned`) |

The `android-repro` job also checks that the APK carries no signature and reports any native library that
still contains a checkout or Gradle-home path. The F-Droid buildserver is a third environment (Debian,
`/home/vagrant`, possibly another JDK; §6).

### Part 1 (before the fix)

**Result: not reproducible across checkout paths yet.** Two release builds from clean clones of
`a1681ca` (fresh `pnpm install --frozen-lockfile`, `expo prebuild --clean`, `SKEPI_PREVIEW=1 gradlew
--no-build-cache assembleRelease -PskepiPreview=true -PskepiDebugSign=true`; JDK 17.0.19, NDK 27.1/27.3,
Windows 11), the same machine and user, checkout paths `%TEMP%/skepi/rb/a` and
`%TEMP%/skepi/rb/build-bb`. Debug-signed so the release key was not used; the comparison ignores the
signature (F-Droid copies it onto its unsigned build). Builds took 21.6 and 24.1 min.

| | Result |
| --- | --- |
| APK entries, names and order | 1349 = 1349, same order |
| Identical entries | 1331, including every `classes*.dex`, `resources.arsc`, resources, `assets/index.android.bundle`, the embedded catalog, map assets and `assets/dexopt/baseline.prof(m)` |
| Differing entries | 18, all native libraries compiled in the build (prebuilt Maven libraries are identical) |
| — only `.note.gnu.build-id` differs (12) | `libappmodules`, `libexpo-modules-core`, `libgesturehandler`, `libop-sqlite`, `libreact_codegen_rngesturehandler_codegen`, `libreact_codegen_safeareacontext`, `librnllama_jni` (4 variants), `librnscreens`, `libworklets`: identical after `llvm-objcopy --remove-section=.note.gnu.build-id` |
| — absolute source paths embedded (5) | `librnllama` (4 CPU variants; ~210 `__FILE__` strings such as `…/rb/a/node_modules/llama.rn/cpp/common/chat-peg-parser.cpp`) and `libreact_codegen_rnscreens` (`RNSScreenShadowNode.cpp`); sizes differ |
| — layout only (1) | `libreanimated`: same strings, different order of RTTI names and relocations; cause not isolated (a same-path rebuild was byte-identical in the preview release, `docs/preview-report.md`) |
| Also machine-specific, identical here only because the user was the same | the Gradle cache path `C:/Users/<user>/.gradle/caches/…/react-android…` inside `libappmodules` and the codegen libraries (F-Droid builds in `/home/vagrant`, GitHub CI in `/home/runner`) |

**Proposed fix (part 1; implemented in part 2, above).** In
`withSkepiAndroid.js`, for every subproject with CMake (same pattern as the existing `subprojects`
block): `-DCMAKE_SHARED_LINKER_FLAGS=-Wl,--build-id=none` and C/C++ flags
`-ffile-prefix-map=<repo root>=. -ffile-prefix-map=<Gradle user home>=/gradle`; for llama.rn check that
its CMake does not override them. Then repeat this two-path comparison, and once it is identical, build
the published APK on Linux CI (same NDK as the F-Droid buildserver) at the tagged commit; the Windows host
toolchain is a second variable that a Linux-to-Linux comparison avoids. Until then the F-Droid fallback
is an F-Droid-signed build (different certificate, see B8/B9).

Tools: `apksigcopier` 1.1.1 (F-Droid's signature copier, installed for the check), a per-entry ZIP
comparison and `llvm-objcopy`/`llvm-readelf` from NDK 27.3 (diffoscope is not available on Windows).

## 5. Still to prepare

- Graphics: `fastlane/metadata/android/en-US/images/icon.png` (512×512) and `featureGraphic.png`
  (1024×500). **Phone screenshots: done** (`fastlane/metadata/android/en-US/images/phoneScreenshots/1_home … 6_tools.png`, 1080×2400, from `e2e/store-screenshots.yaml` via `e2e/run-screenshots.ps1` on the `skepi-host` emulator: preview build installed from the AAB, airplane mode, demo-mode status bar. Card titles show "Draft", no card steps anywhere; Ask shows source excerpts (the 2 GB emulator runs no model, so its line "No GGUF model found" is visible; retake on a phone with the model for v1)).
- Privacy policy public URL (§2, Google Play; v1).
- **AAB: done** (§2, Google Play).
- A first test of the recipe on the F-Droid buildserver (§6).

## 6. fdroiddata recipe (not submitted; linted, not run on the F-Droid buildserver)

The recipe lives in `docs/fdroid/org.skepi.app.yml` (copied below). It targets the first tag that
contains B1–B3 (`v0.1.1-preview` / versionCode 3 are placeholders: set the real version, versionCode and
tag when tagging); `v0.1.0-preview` cannot be built unsigned. Changes from part 1:

- **Raw build** (`output:` with the Gradle call in `build:`, no `gradle: yes`): Metro reads
  `SKEPI_PREVIEW=1` from the environment of the Gradle process, and fdroiddata has no field that sets an
  environment variable for its own Gradle step. `-PskepiUnsigned=true` replaces the signing removal the
  React Native template does with `sed`.
- **No `buildFromSource` patch:** it is in `apps/mobile/package.json` (B2).
- **Reproducible:** `Binaries:` points at the signed GitHub release asset, `AllowedAPKSigningKeys:` at the
  SKEPI certificate. The buildserver's paths (`/home/vagrant/build/org.skepi.app`, its Gradle home and
  NDK) are mapped away by `reproducible.cmake`.

Test status:

| Check | Result |
| --- | --- |
| `fdroid lint org.skepi.app` (fdroidserver 2.4.5 from PyPI, on Windows, with fdroiddata's category names) | clean. `Categories` must be names from fdroiddata's `config/categories.yml` (`Reading`, `Science & Education` are) |
| `fdroid rewritemeta` | only reorders `scanignore` before `scandelete` and wraps the build line (applied); it also writes the `ndk:` list as a quoted string, a rewritemeta quirk of 2.4.5 (`fdroid build` accepts a list) |
| `fdroid scanner` on the unsigned APK | no known non-free classes, no extra signing blocks |
| `fdroid build` on the buildserver image | **not run**: it needs Linux (a Debian VM or the `fdroidserver` Docker image); this machine has neither Docker nor WSL. The `android-repro` job runs the same steps on Ubuntu 24.04 (Node 22, pnpm 10.33.0, Temurin 17), not the Debian buildserver |

Open points for the first buildserver run (an F-Droid reviewer runs it on the merge request, or the
owner with `fdroidserver` in Docker):

- **JDK.** CI builds with Temurin 17; Debian trixie ships OpenJDK 21 (the fdroiddata React Native template
  rewrites the React Native Gradle plugin's toolchain from 17 to 21). If the buildserver compiles with a
  different JDK, the dex files may differ from ours and the reproducible check fails. Then align: either a
  JDK 17 on the buildserver (`sudo:` install) or CI on the buildserver's JDK.
- **Node from forky, pnpm from npm** (`sudo:`), and both NDKs (`ndk:` list).
- `expo prebuild --clean` regenerates `android/` (the recipe's `subdir`) after `init`.

```yaml
Categories:
  - Reading
  - Science & Education
License: GPL-3.0-or-later
SourceCode: https://github.com/Fiouri/skepi
IssueTracker: https://github.com/Fiouri/skepi/issues
Changelog: https://github.com/Fiouri/skepi/blob/HEAD/CHANGELOG.md

AutoName: SKEPI

RepoType: git
Repo: https://github.com/Fiouri/skepi.git
Binaries: https://github.com/Fiouri/skepi/releases/download/v%v/skepi-%v-arm64.apk

Builds:
  - versionName: 0.1.1-preview
    versionCode: 3
    commit: v0.1.1-preview
    subdir: apps/mobile/android/app
    sudo:
      - apt-get update
      - apt-get install -y -t forky nodejs npm
      - npm install -g pnpm@10.33.0
    init:
      - cd ../../../..
      - pnpm install --frozen-lockfile --filter @skepi/mobile... --filter @skepi/catalog-builder...
        --filter @skepi/release-guards... --filter @skepi/emergency-cards...
    output: build/outputs/apk/release/app-arm64-v8a-release-unsigned.apk
    prebuild:
      - cd ../..
      - npx expo prebuild --platform android --clean --no-install
    scanignore:
      - node_modules/hermes-compiler
    scandelete:
      - node_modules/llama.rn/bin
      - node_modules/@op-engineering/op-sqlite/android/src/main/jniLibs
      - node_modules/@op-engineering/op-sqlite/android/src/main/libsqlitevec
      - node_modules/@op-engineering/op-sqlite/android/src/main/tursoLibs
    build:
      - cd ..
      - SKEPI_PREVIEW=1 gradle assembleRelease -PskepiPreview=true -PskepiUnsigned=true
        --no-daemon
    ndk:
      - 27.1.12297006
      - 27.3.13750724

AllowedAPKSigningKeys: 7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9.]+(-preview)?$
CurrentVersion: 0.1.1-preview
CurrentVersionCode: 3
```

## 7. Play Data safety answers

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **No** | "Collect" means transmitting data off the device. SKEPI sends no user data anywhere: no accounts, analytics, crash reporting or SDK that phones home. Questions, answers, location and settings stay on the device. |
| Downloads from Kiwix / Hugging Face / GitHub | not collection | User-initiated file downloads with only the file URL and a generic User-Agent; the developer receives nothing. The host sees the IP address as with any download; the privacy policy says so. |
| P2P / Station transfers | not collection | Device-to-device on the local network, started by the user, no developer server |
| Problem reports | not collection | The app copies or saves text, or opens the system share sheet with it (B6); the user chooses whether, where and through which app to send it. SKEPI transmits nothing |
| Location | not collected | Read on demand for display only; never stored or sent |
| Is all user data encrypted in transit? / Can users request deletion? | not asked | Only shown when data is collected |
| Privacy policy | required | `docs/privacy-policy.md` (public URL, see §2) |

True only while the zero-egress E2E (`dumpsys netstats`, ContentStore request log) keeps passing and
B6 stays a share-sheet hand-off.

## 8. Permission justifications (Play Console and reviewers)

| Permission | Feature | Justification |
| --- | --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Downloads | Content packs the user selects, only from the signed catalog's hosts, through the system DownloadManager |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Map, Tools | One-shot GPS fix shown on the offline map and in Tools when the user taps; foreground only (`ACCESS_BACKGROUND_LOCATION` is blocked in `app.json`); no location is stored or sent |
| `CAMERA` | P2P pairing | Scans the pairing QR code of the other phone; no photos or video are taken or stored. `android.hardware.camera` is not required |
| `NEARBY_WIFI_DEVICES` (`neverForLocation`) | P2P | Required since Android 13 to start a `LocalOnlyHotspot` and join it with `WifiNetworkSpecifier`; never used to derive location |
| `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, `CHANGE_NETWORK_STATE` | P2P | Create or join the local hotspot and bind the transfer socket to it |
| `org.skepi.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | — | Signature permission generated by AndroidX for non-exported runtime receivers |

None is on Play's declaration-form list (SMS/Call Log, background location, all-files access,
`QUERY_ALL_PACKAGES`, `REQUEST_INSTALL_PACKAGES`, photo/video, exact alarm, full-screen intent,
accessibility, Health Connect, VPN). The release allowlist in CI (`tools/release-guards`) keeps it so.

## 9. Content rating (IARC) — suggested answers

Category: **Reference, News, or Educational**. No violence, sexual content, profanity, drugs, gambling or
horror created by the app; the encyclopedia packs describe such topics in encyclopedic text (answer the
reference-content questions accordingly). No user-to-user communication or user-generated content
(P2P moves only catalog-verified packs between the user's own devices), no location sharing, no
digital purchases, no unrestricted web access (the viewer opens no web pages). The owner fills and
submits the questionnaire; re-do it if features change.

## Sources (checked 2026-10-12)

- F-Droid Inclusion Policy — https://f-droid.org/docs/Inclusion_Policy/
- F-Droid Anti-Features — https://f-droid.org/docs/Anti-Features/
- F-Droid Reproducible Builds — https://f-droid.org/docs/Reproducible_Builds/
- F-Droid Build Metadata Reference — https://f-droid.org/docs/Build_Metadata_Reference/
- F-Droid descriptions, graphics and screenshots (fastlane layout, limits) — https://f-droid.org/docs/All_About_Descriptions_Graphics_and_Screenshots/
- fdroiddata React Native template — https://gitlab.com/fdroid/fdroiddata/-/blob/master/templates/build-react-native.yml
- Example React Native reproducible-build plan (Node from Debian forky, Hermes, scandelete) — https://github.com/mmlado/keycard-pal/issues/316
- Debian `nodejs` versions — https://packages.debian.org/search?keywords=nodejs&searchon=names&exact=1&suite=all&section=all
- Play target API level — https://developer.android.com/google/play/requirements/target-sdk
- Play testing requirements for new personal accounts — https://support.google.com/googleplay/android-developer/answer/14151465
- Play Console requirements (Organization accounts, health apps) — https://support.google.com/googleplay/android-developer/answer/10788890
- Health apps declaration — https://support.google.com/googleplay/android-developer/answer/14738291
- Health Content and Services policy — https://support.google.com/googleplay/android-developer/answer/16679511
- Data safety section — https://support.google.com/googleplay/android-developer/answer/10787469
- AI-Generated Content policy — https://support.google.com/googleplay/android-developer/answer/13985936
- Device and Network Abuse policy — https://support.google.com/googleplay/android-developer/answer/16273414
- Permissions and APIs that access sensitive information — https://support.google.com/googleplay/android-developer/answer/16558241
- Content ratings — https://support.google.com/googleplay/android-developer/answer/188189
- Store listing limits — https://support.google.com/googleplay/android-developer/answer/9859152
- Android developer verification — https://developer.android.com/developer-verification
- F-Droid on developer verification — https://f-droid.org/2026/02/24/open-letter-opposing-developer-verification.html
- Local-only hotspot and `NEARBY_WIFI_DEVICES` — https://developer.android.com/develop/connectivity/wifi/localonlyhotspot
