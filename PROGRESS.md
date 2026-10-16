**Current:** Store readiness (Android, F-Droid first) — part 3 done; no tag, release or fdroiddata request yet
**Next step:** owner: decide on the tag/release and the fdroiddata merge request; graphics (icon 512×512, featureGraphic 1024×500) still open (`docs/store-readiness.md` §5)
**Last session:** 2026-10-16 — clean Maestro 8/8 on the S23 (airplane mode, device lock), Ask store screenshot retaken with the VPN off; two E2E flow fixes (`794f997`)

## Store readiness part 3 (closed 2026-10-16)

- Done: `fdroid build` in CI gives the same bytes as `android-repro`; JDK 21 toolchain for published builds; per-device lock in every SKEPI device script; Ask store screenshot from the S23 with the model.
- Verified: `pnpm verify` 46/46, Rust fmt/clippy/test, `android-repro` + `fdroid-build` same SHA-256 (at `36d712d`); Maestro on the S23 8/8 in one run (2026-10-16): 0 blocked WebView requests, 0 bytes over real interfaces, SMS hand-off 1, problem-report CHOOSER 1.
- Open risks: the S23 dropped off USB three times in 40 minutes on 2026-10-16 (cable or port); NordVPN on the S23 reconnects by itself (auto-connect); Selis does not take the device lock yet.
- Device testing: S23 only (owner's phone); untethered energy run still owner-only.
