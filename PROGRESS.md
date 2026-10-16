**Current:** v0.1.1-preview — release prep done (`a974d92`, name shown as S.K.E.P.I.); no tag, release or fdroiddata request
**Next step:** owner: tag `v0.1.1-preview`, sign the `android-repro` APK locally, publish (fill the SHA-256 table in `docs/release-notes/v0.1.1-preview.md`), open the fdroiddata MR with the tag's full commit hash
**Last session:** 2026-10-16 — v0.1.1-preview prep: verify 46/46, Rust gates, signed preview build, tauri build, Maestro S23 8/8, CI green, android-repro = fdroid-build SHA-256 `13fdec22…fcdc` (run 38947609768)

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
