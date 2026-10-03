# native/kiwix

Pinned native dependency for `modules/expo-zim` (Android).

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
