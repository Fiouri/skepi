**Current:** Owner follow-ups 2026-10-21 (legal research in repo, exact short-step bundle scan, map GPS energy measured) — done, on main, not released
**Next step:** owner: send `docs/ifrc-notice-email.md` to the IFRC; then tag the next preview (F-Droid: possible NonFreeAssets, see `docs/fdroid/merge-request.md`)
**Last session:** 2026-10-21 — legal-research.md committed; bundle scan 61/61 incl. "Access EMS." (Hermes string table); map GNSS+compass +131 mAh/h (blackout +44) unplugged on the S23; verify 49/49, Android release build, Maestro S23 9/9 flows, CI (see log)

## Owner follow-ups 2026-10-21 (afternoon)

- Done: `docs/legal-research.md` committed and linked from `docs/architecture.md`; `cards-bundle` matches steps too short for a probe ("Access EMS.") as an exact whole string (parsed Hermes v98 string table, or a whole JS string literal), so release builds require 61/61 sourced steps; the map's compass now starts only with location updates; `e2e/run-map-energy.ps1` + `e2e/map-energy.yaml` + `e2e/energy-sampler.sh` (unplugged map energy, wireless adb).
- Verified: `pnpm verify` 49/49 (release-guards 19 tests, 4 new on real hermesc bytecode); Android preview release build (Gradle cards scan 61/61, permission allowlist pass) + debug build; desktop dist scan 61/61 (desktop sources unchanged, not rebuilt); Maestro on the S23 (airplane mode, device lock): all 9 flows passed with 0 blocked requests and 0 bytes egress (4 re-run after the phone dropped off adb post-flow).
- Measured (S23 unplugged, 15 min per window, brightness 100/255, fix held): map without location 175 mA / 203 mAh/h; follow 292 mA / 333 mAh/h; blackout without location 166 mA / 174 mAh/h; blackout follow 201 mA / 217 mAh/h. GNSS + compass: +117 mA (+131 mAh/h) normal, +35 mA (+44 mAh/h) blackout. Data: `docs/energy/map-2026-10-21/`.
- Open risks: the S23 still drops off adb after flows (cable/port); iOS heading cone needs a real iPhone; IFRC notice email not sent.

## Owner decisions 2026-10-21 (legal/compliance + live map position)

- Done: emergency cards = verbatim IFRC Guidelines 2025 excerpts with citation (8 cards, 61 steps; water purification, earthquake, fire, flood unsourced, never bundled); `tools/cards-source-check` (pinned URL + SHA-256, pdftotext) + `source-check.lock.json`, release gates and `cards-bundle` scan; IFRC notice in About; no AI summary on medical intent; one intended-purpose statement (store, About, README, privacy policy); non-commercial rule (architecture, CONTRIBUTING); "AI-generated summary" line in shared reports; live position/heading/follow on the map (Android + iOS module API, core logic, map UI); `docs/ifrc-notice-email.md` (not sent); F-Droid note for the next version.
- Verified: `pnpm verify` 49/49; cards-source-check 61/61 with Poppler 26.09 and Xpdf 4.06, and in CI on Linux and macOS; gate fails on an altered step (local + CI); Android preview release build (cards gate, bundle 0/202 unsourced, 60/60 sourced, permission allowlist unchanged); desktop `tauri build` MSI + NSIS, bundle scan, tauri-driver smoke 26/26, Playwright 15/15; Maestro on the S23 (airplane mode, device lock): tools, map-location (debug MockLocation), onboarding, ask-en, ask-t1, medical, cards, blackout, places all passed, 0 blocked requests, 0 bytes egress; CI push runs green (incl. ios-build, android-release-guards, android-repro).
- Open risks: IFRC licence is non-commercial (F-Droid NonFreeAssets possible); the S23 dropped off adb after most flows (cable/port) so the suite ran flow by flow; iOS heading cone needs a real iPhone.
- Device testing: S23 (Android) + iOS Simulator in CI (puck with a simulated fix); Windows 11 desktop.

## v0.1.1-preview release (2026-10-17)

- Done: GitHub pre-release https://github.com/Fiouri/skepi/releases/tag/v0.1.1-preview (signed APK, MSI, NSIS, `SHA256SUMS.txt`); release notes with hashes; recipe `commit:` = tag hash; fdroiddata MR text.
- Verified: uploaded hashes re-downloaded and checked (APK `b3e35ed4…160e`, MSI `fe562fd9…6fb1b`, NSIS `78f5f56c…93a6`; unsigned `13fdec22…fcdc`); signed APK = unsigned entries + signature; S23 smoke test on the signed APK 8/8 (run 2; run 1 6/8 from a Maestro timeout and an adb server crash); Windows per-user upgrade one install, data kept; after the recipe change `android-repro` + `fdroid-build` again `13fdec22…fcdc` (run 38973901393).
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
