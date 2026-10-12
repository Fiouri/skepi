# Release process (Android)

Decided 2026-10-12: **F-Droid first**, Google Play deferred to v1 (`docs/store-readiness.md`). Every
published APK is the reproducible **unsigned** APK built by CI, signed locally by the maintainer with the
SKEPI release key. The key never enters CI, the repository or the project's Gradle properties
(`docs/release-signing.md`).

```
push to main ──► android-repro (2 clean Linux builds, different paths) ──► identical? ──► artifact:
                                                                                         unsigned APK + SHA256SUMS.txt
maintainer: download artifact ──► scripts/release/sign-release-apk.ps1 (apksigner, release key)
            ──► checks: SHA-256, unsigned, aligned, certificate = published fingerprint, contents = artifact
            ──► GitHub release asset skepi-<version>-arm64.apk ──► F-Droid builds the tag, compares, ships ours
```

## 1. Build switches

| Gradle property | Result | Used by |
| --- | --- | --- |
| *(none; the four `SKEPI_RELEASE_*` properties in `~/.gradle/gradle.properties`)* | Release signed with the SKEPI key (unchanged) | Local device builds (S23 E2E) |
| `-PskepiUnsigned=true` | Release with no signing config: `app-arm64-v8a-release-unsigned.apk`, unsigned `app-release.aab` | CI (`android-release-guards`, `android-repro`), F-Droid |
| `-PskepiDebugSign=true` | Expo debug key, loud warning; never distributed | Local E2E on emulators |
| *(none of the above)* | Fails at `skepiCheckReleaseSigning` | — |

`-PskepiUnsigned` and `-PskepiDebugSign` are exclusive. Preview builds add `SKEPI_PREVIEW=1` and
`-PskepiPreview=true` (no emergency card steps in the bundle).

Release builds compile everything native from source: llama.cpp (`rnllamaBuildFromSource`), React
Native libraries, op-sqlite/SQLCipher and, since 2026-10-12, every Expo module
(`expo.autolinking.android.buildFromSource: [".*"]` in `apps/mobile/package.json`; before, 15 Expo modules
came as prebuilt AARs from `node_modules`). Every CMake build loads `apps/mobile/plugins/reproducible.cmake`
(`-Wl,--build-id=none`; `-ffile-prefix-map` for the checkout, the Gradle user home and the NDK).

## 2. Release steps

1. **Version.** `apps/mobile/app.json`: `expo.version` and `android.versionCode` (and `ios.buildNumber`);
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`; `CHANGELOG.md`.
2. **CI.** Push to `main`. `CI` must be green and **Android reproducible build → `android-repro`**
   green: it writes the commit, version, run id and the APK's SHA-256 to the job summary and uploads the
   artifact `skepi-<version>-vc<versionCode>-<commit12>-unsigned` (`skepi-<version>-arm64-unsigned.apk` +
   `SHA256SUMS.txt`, kept 90 days).
3. **Tag (owner).** `git tag -s v<version> <commit>` on exactly that commit; push the tag.
4. **Download.**
   ```powershell
   gh run download <run-id> --repo Fiouri/skepi -n skepi-<version>-vc<code>-<commit12>-unsigned -D $env:TEMP\skepi\release
   ```
5. **Sign locally (owner).**
   ```powershell
   ./scripts/release/sign-release-apk.ps1 -Unsigned $env:TEMP\skepi\release\skepi-<version>-arm64-unsigned.apk
   ```
   The script checks the SHA-256 against `SHA256SUMS.txt`, that the APK is unsigned and zip-aligned (4
   bytes, 16 KB pages), signs with `apksigner` (APK Signature Scheme v2 only, like the Gradle release
   build; the key file and alias come from `~/.gradle/gradle.properties`, apksigner prompts for the
   password), then checks that
   the signer certificate is the published one (`7d61c382…447e`) and that the signed APK holds the
   artifact's entries byte for byte, plus only the signature. It prints the signed APK's SHA-256.
6. **Smoke test.** `adb install -r` the signed APK on the S23 and run `e2e/run-e2e.ps1` (airplane mode).
   It installs over the previous release (same certificate).
7. **Publish (owner).** GitHub release for the tag with `skepi-<version>-arm64.apk` (the name the F-Droid
   recipe's `Binaries:` expects), `SHA256SUMS.txt` with the signed APK's hash, the certificate fingerprint
   and the CI run id.
8. **F-Droid.** The fdroiddata recipe (`docs/store-readiness.md` §6) builds the tag unsigned on the
   buildserver, copies the signature from our `Binaries:` APK (`apksigcopier`) and verifies it; when the
   bytes match, F-Droid publishes our signed APK. On a mismatch F-Droid publishes nothing for that version
   and the build log shows the differing files.

## 3. Checking a published APK

Anyone can repeat the comparison:

```sh
python3 scripts/ci/apk-compare.py contents skepi-<version>-arm64.apk skepi-<version>-arm64-unsigned.apk
apksigner verify --print-certs skepi-<version>-arm64.apk   # Signer #1 certificate SHA-256 digest: 7d61c382…447e
```

or rebuild the tag on Linux (`.github/workflows/android-repro.yml` lists the exact steps: Node 22, pnpm
from `packageManager`, Temurin 17, `pnpm install --frozen-lockfile`, `expo prebuild`, `SKEPI_PREVIEW=1
./gradlew assembleRelease -PskepiUnsigned=true -PskepiPreview=true`) and compare with `apk-compare.py same`.

## 4. Not part of this flow

- Local signed builds (`gradlew assembleRelease` with the key) stay for device testing; they are built
  on Windows and are not the published artifact.
- Google Play (AAB, Play App Signing, account type, IARC, Health declaration): deferred to v1.
- Android developer verification (package + certificate registration): owner action before 2027
  (roadmap).
