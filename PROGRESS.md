**Current:** v0.1.1-preview — released (GitHub pre-release, tag `a974d925a9dc`); fdroiddata merge request prepared, not opened
**Next step:** owner: open the fdroiddata merge request on GitLab with `docs/fdroid/org.skepi.app.yml` and the text in `docs/fdroid/merge-request.md`
**Last session:** 2026-10-17 — v0.1.1-preview published and hashes verified; S23 smoke test 8/8 on the signed APK (second run); Windows per-user upgrade 0.1.0→0.1.1 OK; MSI upgrade not tested

## v0.1.1-preview release (2026-10-17)

- Done: GitHub pre-release https://github.com/Fiouri/skepi/releases/tag/v0.1.1-preview (signed APK, MSI, NSIS, `SHA256SUMS.txt`); release notes with hashes; recipe `commit:` = tag hash; fdroiddata MR text.
- Verified: uploaded hashes re-downloaded and checked (APK `b3e35ed4…160e`, MSI `fe562fd9…6fb1b`, NSIS `78f5f56c…93a6`; unsigned `13fdec22…fcdc`); signed APK = unsigned entries + signature; S23 smoke test on the signed APK 8/8 (run 2; run 1 6/8 from a Maestro timeout and an adb server crash); Windows per-user upgrade one install, data kept.
- Open risks: MSI upgrade over 0.1.0 not tested (admin); the adb server on this PC stopped by itself several times on 2026-10-17 (cause unknown); F-Droid reviewers may question the scanignored Hermes compiler and esbuild.
- Device testing: S23 + this Windows 11 PC only.

## v0.1.1-preview prep (closed 2026-10-16, not tagged)

- Done: name decision recorded (Project S.K.E.P.I., no registration, rename risk accepted); visible name "S.K.E.P.I." in the Android label, desktop window/About, store texts, README, privacy policy; versions 0.1.1-preview / vc3; CHANGELOG, `changelogs/3.txt`, fdroiddata recipe, release-notes draft.
- Verified: `pnpm verify` 46/46, Rust fmt/clippy/test, signed preview `assembleRelease`, `tauri build` (MSI + NSIS), Maestro S23 8/8 (airplane mode, device lock), CI run 38947609658 green, `android-repro` + `fdroid-build` same SHA-256 `13fdec22…fcdc` (run 38947609768).
- Open risks: Windows installers keep the product name "SKEPI" (upgrade path); the MSI/NSIS upgrade over an installed 0.1.0 was not run; CI flakes this run (NDK download, iOS WKWebView test timeout) passed on rerun.
- Device testing: S23 only.

## Store readiness part 3 (closed 2026-10-16)

- Done: `fdroid build` in CI gives the same bytes as `android-repro`; JDK 21 toolchain for published builds; per-device lock in every SKEPI device script; Ask store screenshot from the S23 with the model.
- Verified: `pnpm verify` 46/46, Rust fmt/clippy/test, `android-repro` + `fdroid-build` same SHA-256 (at `36d712d`); Maestro on the S23 8/8 in one run (2026-10-16): 0 blocked WebView requests, 0 bytes over real interfaces, SMS hand-off 1, problem-report CHOOSER 1.
- Open risks: the S23 dropped off USB three times in 40 minutes on 2026-10-16 (cable or port); NordVPN on the S23 reconnects by itself (auto-connect); Selis does not take the device lock yet.
- Device testing: S23 only (owner's phone); untethered energy run still owner-only.
