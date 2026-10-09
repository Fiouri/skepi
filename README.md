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

## Privacy

SKEPI has no accounts, analytics, ads or telemetry. It uses the network only when you ask it to:
downloading packs from the signed catalog's mirrors, and sharing packs over the local network (P2P on
phones, Station mode on the desktop). Everything else (search, articles, AI answers, maps, places,
emergency cards) runs offline on the device.

- **Android:** egress is checked in every E2E run in airplane mode (0 requests, 0 bytes outside
  ContentStore).
- **Windows desktop:** the app process makes no connection. The Microsoft WebView2 Runtime that draws
  the UI is a browser with its own services; the app switches off its background networking, component
  updates, domain-reliability reports, pings, SmartScreen reputation checks and Microsoft-account
  integration. Measured online with the app idle and in use (`apps/desktop/e2e/egress.mjs`): no
  connection outside the computer. Before that last switch, the runtime fetched the Windows account's
  profile from `substrate.office.com` at every start. What the app cannot control: WebView2 Runtime
  updates (Microsoft Edge Update, shared by all apps) and settings an administrator or user applies to
  WebView2 (e.g. the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable). Details:
  [`docs/threat-model.md`](docs/threat-model.md), "WebView2 runtime egress".

## License

GPL-3.0-or-later (required by libzim / libkiwix). See [LICENSE](LICENSE).
Not a medical device; educational content, no warranty.
