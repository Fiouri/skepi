# Store readiness — Android (F-Droid and Google Play)

Research and preparation only (2026-10-12): nothing was submitted, no account was touched, no signing
or build change was made. Audited commit: `a1681ca` (app `0.1.0-preview`, versionCode 2,
`org.skepi.app`). Decisions on build flavors and submission stay with the owner.

Status legend: **ready** · **blocked** (a repo change is needed first) · **owner** (needs an owner
decision or account action).

## 1. Findings that block or shape a submission

| # | Finding | Store | Status | Proposal |
| --- | --- | --- | --- | --- |
| B1 | A release build cannot be produced **unsigned**: without the four `SKEPI_RELEASE_*` properties it fails (`skepiCheckReleaseSigning`), and the only escape hatch signs with the debug key. F-Droid builds an unsigned APK and then either signs it or copies the upstream signature onto it. | F-Droid | blocked | Add an explicit `-PskepiUnsigned=true` to `withReleaseSigning.js` (release `signingConfig null`, a loud log line, default stays fail-closed). Signing change: owner approval first. |
| B2 | Expo modules are linked as **prebuilt AARs** from `node_modules/*/local-maven-repo` (11 `host.exp.exponent:*` artifacts on the release classpath). F-Droid requires binaries built from source (or from an allowed repository); `node_modules` is not one. | F-Droid | blocked | `"expo": { "autolinking": { "android": { "buildFromSource": [".*"] } } }` in `apps/mobile/package.json` (the setting the fdroiddata React Native template turns on). Applying it to every build keeps one recipe and one reproducible APK; it changes the release build, so it waits for the owner. |
| B3 | Release APKs are **not reproducible across checkout paths**: 18 of 1349 entries differ, all native libraries built in the build (build-id, absolute `__FILE__` paths, one link-order difference). Java/Kotlin, resources and the JS bundle are identical (§4). | F-Droid (reproducible, our signature) | blocked | `--build-id=none` and `-ffile-prefix-map` for every CMake build, then re-compare; build the published APK on Linux CI (§4). |
| B4 | The Health apps declaration must be accurate: SKEPI ships medical reference content (WikiMed packs) and emergency cards/numbers, i.e. the **Medical** group ("Medical Reference and Education", "Emergency and First Aid"). Play Console requirements list "Health apps, such as Medical apps" among the services that must register as an **Organization** account (D-U-N-S number). | Play | owner | Decide the account type before creating it. A personal account would have to declare no health features, which would be inaccurate. Verify the exact trigger in Play Console when registering. |
| B5 | New **personal** accounts (created after 2023-11-13) must run a closed test with ≥ 12 testers opted in for 14 consecutive days before production access. | Play | owner | Only if a personal account is chosen (see B4). Recruit 12 testers (e.g. from the GitHub preview) before the first upload. |
| B6 | **AI-Generated Content** policy: apps that generate content from user prompts must let users report offensive content "to developers without needing to exit the app". "Report a problem with this answer" only copies or saves text. | Play | owner | Smallest compliant option with no new network call: a "Send" button that hands the report to the system share sheet / e-mail app (`ACTION_SEND`, like the existing `sms:`/`tel:` hand-offs). The user sends it; the app opens no connection. Needs an owner decision on the destination (an e-mail alias or the GitHub issues URL). |
| B7 | Play delivers split APKs from an AAB. The app already refuses to share itself from a split install (`ERR_P2P_APK`), so "share the app" does not work in the Play build; packs still share. | Play | ready (documented) | Mention in the Play listing or the share screen later; no change needed for submission. |
| B8 | **Play App Signing** is mandatory for new apps. If Google generates the app signing key, Play installs carry a different certificate than GitHub/F-Droid builds: users cannot move between channels without uninstalling, and the fingerprint in About (`ANDROID_RELEASE_SIGNING_SHA256`) and the Station check would not match the Play install. | Play | owner | Upload the existing SKEPI release key to Play App Signing (Play Console "use an existing key", PEPK export) so every channel shares one certificate, and register a separate upload key. Google then holds a copy of the key: owner decision. |
| B9 | **Android developer verification**: from 2026-09-30 certified devices in Brazil, Indonesia, Singapore and Thailand install only apps from verified developers; global in 2027. This covers the GitHub APK and F-Droid installs too. | All | owner | Register `org.skepi.app` and its signing certificate (Play Console registers Play apps and can register apps distributed outside Play). F-Droid publicly opposes the programme; a reproducible build (F-Droid publishing our signed APK) keeps one registered certificate. |

No Google Play Services, Firebase, analytics, ads or other proprietary SDK was found (§3). No
`fdroid` flavor is needed for dependencies; B1–B3 are build changes for all channels, not a flavor.

## 2. Checklist per store

### F-Droid

| Item | Status | Evidence / note |
| --- | --- | --- |
| FOSS licence | ready | GPL-3.0-or-later (`LICENSE`); all runtime dependencies are FOSS (§3) |
| No non-free dependencies (Play Services, Firebase, tracking, ads) | ready | Release runtime classpath audit (§3): none |
| Binary dependencies from source or allowed repositories | blocked (B2) | Maven Central AARs are allowed if freely licensed (§3 list); Expo's `local-maven-repo` AARs are not |
| Prebuilt files in `node_modules` that the build does not use | ready with recipe | `scandelete`: `llama.rn/bin` (Qualcomm HTP + `libOpenCL.so`; the Gradle plugin disables `syncRNLlamaHtpAssets` and excludes the Hexagon variant), `@op-engineering/op-sqlite/android/src/main/{jniLibs,libsqlitevec,tursoLibs}` (libsql/turso/sqlite-vec, not packaged: SQLCipher mode). `scanignore`: `hermes-compiler` (Hermes is an allowed prebuilt). Install only what the Android build runs (`pnpm install --frozen-lockfile --filter @skepi/mobile... --filter @skepi/catalog-builder... --filter @skepi/release-guards... --filter @skepi/emergency-cards...`: Gradle runs the catalog, card and bundle checks with `tsx`) so `tools/rag-eval`'s `node-llama-cpp` binaries are never fetched; untested |
| llama.cpp native code | ready | Compiled from source (`rnllamaBuildFromSource=true`); APK has only the 3 CPU variants built by CMake |
| Toolchain on the Debian buildserver | ready with recipe | Node ≥ 22 required (`engines`); Debian trixie ships 20.19, forky ships 24.x (`apt-get install -t forky nodejs npm`, as other React Native recipes do); pnpm is not in Debian: `npm install -g pnpm@10.33.0`. JDK 17. NDK `27.1.12297006` and `27.3.13750724`; CMake from the SDK (the Windows-only CMake 3.31.6 rule does not run on Linux) |
| Unsigned release build | blocked (B1) | |
| Reproducible build (publish our signed APK via `Binaries:` + `AllowedAPKSigningKeys:`) | blocked (B3) | Path-dependent native libraries (§4); F-Droid could still ship its own signed build meanwhile |
| Anti-features | ready | None expected: no tracking, ads or non-free assets; content hosts (Kiwix, Hugging Face, GitHub) serve freely licensed files, and every pack can also come from import or P2P, so the app does not "depend entirely" on a non-free service (NonFreeNet). Disclose the download hosts in the submission |
| Metadata | ready | `fastlane/metadata/android/en-US/` (title, short and full description, `changelogs/2.txt`); screenshots and icon still to add (§5) |
| Version scheme | ready | Tags `v<version>`, versionCode in `apps/mobile/app.json` (2 for `v0.1.0-preview`); a recipe pins the full commit hash |
| fdroiddata recipe | owner | Draft in §6; submission is an owner action (GitLab merge request) |

### Google Play

| Item | Status | Evidence / note |
| --- | --- | --- |
| Target API level | ready | targetSdk 36 (`aapt2 dump badging`); required ≥ 36 for new apps and updates since 2026-08-31 |
| 16 KB page size | ready | All 39 native libraries have 16 KB (`0x4000`) LOAD alignment (`llvm-readelf`), `zipalign -c -P 16` passes |
| 64-bit | ready | arm64-v8a only (ABI split); no 32-bit code |
| AAB | owner | `bundleRelease` not built or tested yet; build and test it before the first upload |
| Developer account type, closed test | owner | B4, B5 |
| Play App Signing key | owner | B8 |
| Privacy policy URL | owner | `docs/privacy-policy.md`; public URL: `https://github.com/Fiouri/skepi/blob/main/docs/privacy-policy.md` (repo is public) or GitHub Pages (not enabled; owner) |
| Data safety form | ready | Answers in §7 |
| Health apps declaration | owner | B4: declare Medical → Medical Reference and Education, Emergency and First Aid; description carries the required disclaimer |
| Health Content and Services policy | ready | Listing says "not a medical device and does not diagnose, treat, cure, or prevent any medical condition" and to consult a healthcare professional; no medical claims; "not for emergency use" |
| AI-Generated Content policy | owner | B6 |
| Permissions | ready | None needs a Play declaration form (§8) |
| Content downloaded after install | ready | Packs are data (ZIM, GGUF weights, PMTiles, SQLite); no dex/JAR/`.so` is downloaded; ZIM JavaScript is never run (sealed viewer). The Device and Network Abuse policy forbids downloading executable code only |
| Self-update / installing APKs | ready | No self-update, no `REQUEST_INSTALL_PACKAGES`; the APK share page is disabled on split (Play) installs (B7) |
| Content rating (IARC) | owner | Suggested answers in §9 |
| Target audience | owner | Suggest 18+ for the Developer Preview (medical content, AI summaries; keeps the app out of the Families policy) |
| Ads declaration | ready | No ads |
| Store listing text | ready | `fastlane/metadata/android/en-US/` (title 30/30, short 80/80, full 3145/4000 characters); graphics still to add (§5) |
| Developer verification | owner | B9 |

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

**Proposed fix (changes the release build: owner decision, not implemented).** In
`withSkepiAndroid.js`, for every subproject with CMake (same pattern as the existing `subprojects`
block): `-DCMAKE_SHARED_LINKER_FLAGS=-Wl,--build-id=none` and C/C++ flags
`-ffile-prefix-map=<repo root>=. -ffile-prefix-map=<Gradle user home>=/gradle`; for llama.rn check that
its CMake does not override them. Then repeat this two-path comparison, and once it is identical, build
the published APK on Linux CI (same NDK as the F-Droid buildserver) at the tagged commit; the Windows host
toolchain is a second variable that a Linux-to-Linux comparison avoids. Until then the F-Droid fallback
is an F-Droid-signed build (different certificate, see B8/B9).

Tools: `apksigcopier` 1.1.1 (F-Droid's signature copier, installed for the check), a per-entry ZIP
comparison and `llvm-objcopy`/`llvm-readelf` from NDK 27.3 (diffoscope is not available on Windows).

## 5. Still to prepare (not in this change)

- Graphics: `fastlane/metadata/android/en-US/images/icon.png` (512×512), `featureGraphic.png`
  (1024×500), `phoneScreenshots/` (2–8). Play needs the same assets. Screenshots must not show card
  steps (none exist in preview builds) or medical claims.
- Privacy policy public URL (§2, Google Play).
- AAB build and test (`bundleRelease`).

## 6. Draft fdroiddata recipe (not submitted, untested on the F-Droid buildserver)

Assumes B1 (`-PskepiUnsigned=true`) and B2 (`buildFromSource`) are in the tagged commit. Open points
for a buildserver test: `expo prebuild --clean` regenerates `android/` (the recipe's `subdir`), so the
filter install must also keep `tsx` at the root, and the two NDK versions must both be installed.

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
  - versionName: 0.1.0-preview
    versionCode: 2
    commit: <full commit hash of the tag>
    subdir: apps/mobile/android/app
    sudo:
      - apt-get update
      - apt-get install -y -t forky nodejs npm
      - npm install -g pnpm@10.33.0
    init: cd ../../../.. && pnpm install --frozen-lockfile --filter @skepi/mobile... --filter @skepi/catalog-builder... --filter @skepi/release-guards... --filter @skepi/emergency-cards...
    gradle:
      - yes
    output: build/outputs/apk/release/app-arm64-v8a-release-unsigned.apk
    prebuild: cd ../.. && npx expo prebuild --platform android --clean --no-install
    scandelete:
      - node_modules/llama.rn/bin
      - node_modules/@op-engineering/op-sqlite/android/src/main/jniLibs
      - node_modules/@op-engineering/op-sqlite/android/src/main/libsqlitevec
      - node_modules/@op-engineering/op-sqlite/android/src/main/tursoLibs
    scanignore:
      - node_modules/hermes-compiler
    build: export SKEPI_PREVIEW=1 && gradle assembleRelease -PskepiPreview=true -PskepiUnsigned=true
    ndk:
      - 27.1.12297006
      - 27.3.13750724

AllowedAPKSigningKeys: 7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9.]+(-preview)?$
CurrentVersion: 0.1.0-preview
CurrentVersionCode: 2
```

## 7. Play Data safety answers

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **No** | "Collect" means transmitting data off the device. SKEPI sends no user data anywhere: no accounts, analytics, crash reporting or SDK that phones home. Questions, answers, location and settings stay on the device. |
| Downloads from Kiwix / Hugging Face / GitHub | not collection | User-initiated file downloads with only the file URL and a generic User-Agent; the developer receives nothing. The host sees the IP address as with any download; the privacy policy says so. |
| P2P / Station transfers | not collection | Device-to-device on the local network, started by the user, no developer server |
| Problem reports | not collection | The app copies or saves text; the user chooses whether and where to send it |
| Location | not collected | Read on demand for display only; never stored or sent |
| Is all user data encrypted in transit? / Can users request deletion? | not asked | Only shown when data is collected |
| Privacy policy | required | `docs/privacy-policy.md` (public URL, see §2) |

True only while the zero-egress E2E (`dumpsys netstats`, ContentStore request log) keeps passing and
B6, if adopted, stays a share-sheet hand-off.

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
