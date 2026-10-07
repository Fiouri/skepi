# Project S.K.E.P.I.

**Survival Knowledge & Emergency Pocket Intelligence** — an open-source, mobile-first, fully offline
knowledge library (ZIM / Wikipedia), offline vector maps (PMTiles) and an on-device AI assistant that
answers only from local sources, with citations.

> Status: **Phase 2a (Android only):** P2P sharing between phones (shared Wi-Fi or a local hotspot, QR
> pairing, pinned TLS, every chunk checked against the signed catalog, app sharing by APK page), offline place
> search and emergency points from OpenStreetMap, a Greece map pack, English-only until v1. Not usable by end
> users yet: the emergency cards are unreviewed drafts. See [`docs/architecture.md`](docs/architecture.md),
> [`docs/phase-2a-report.md`](docs/phase-2a-report.md) and the [Phase 1 gate](docs/phase-1-gate.md).

## Layout

```
apps/mobile          Expo (dev build, New Architecture) app
packages/contracts   TS interfaces (KnowledgeEngine, InferenceEngine, DeviceProfile)
packages/core        Pure TS: retrieval, Layer 1, char budgets, prompts, post-validation, emergency/medical lexicons
packages/i18n        English (default) / Greek UI strings
packages/db          SQL migrations + typed queries (packs, settings, energy samples)
packages/emergency-cards  Draft emergency cards (public-domain sources per step) + per-country emergency numbers
packages/ui-tokens   Light and blackout themes, touch targets (WCAG AA tested)
modules/expo-zim     Kotlin Expo module over libkiwix/libzim (java-libkiwix AAR) + sealed zim:// viewer
modules/expo-device-profile  RAM, CPU topology, battery (incl. charge counter), thermal
modules/expo-emergency-tools  SOS torch (Morse), compass, one-shot GNSS fix, screen brightness
native/kiwix         Pinned libkiwix version + checksum
tools/rag-eval       Answer-quality eval (node-llama-cpp on CPU + python-libzim), golden sets, CI smoke
scripts/             provision.ps1 (download + verify + adb push content)
e2e/                 Maestro flows (run-e2e.ps1)
```

## Develop

```sh
pnpm install
pnpm verify          # typecheck + lint + unit tests
```

Prerequisites (Android): Node 22+, pnpm 10, JDK 17, Android SDK 36 with NDK `27.1.12297006` and `27.3.13750724`
(llama.rn is compiled from source), and on Windows CMake `3.31.6` (`sdkmanager "cmake;3.31.6"`; its ninja supports
long paths). E2E: [Maestro](https://github.com/mobile-dev-inc/maestro) 2.x.

Android release build (no EAS):

```sh
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

Content (ZIM, GGUF, PMTiles) is not bundled; provision a connected device (app installed and launched once) with
`scripts/provision.ps1` (English packs + Greek locale pack, Q4_0 model), then run the offline E2E with
`e2e/run-e2e.ps1`. Answer quality: `pnpm --filter @skepi/rag-eval eval` (see [`tools/rag-eval`](tools/rag-eval/README.md)).

## License

GPL-3.0-or-later (required by libzim / libkiwix). See [LICENSE](LICENSE).
Not a medical device; educational content, no warranty.
