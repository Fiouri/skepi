# Project S.K.E.P.I.

**Survival Knowledge & Emergency Pocket Intelligence** — an open-source, mobile-first, fully offline
knowledge library (ZIM / Wikipedia), offline vector maps (PMTiles) and an on-device AI assistant that
answers only from local sources, with citations.

> Status: **Phase 0 spike (Android only).** Not usable by end users yet. See
> [`docs/architecture.md`](docs/architecture.md) and [`docs/spike-report.md`](docs/spike-report.md).

## Layout

```
apps/mobile          Expo (dev build, New Architecture) spike app
packages/contracts   TS interfaces (KnowledgeEngine, InferenceEngine, DeviceProfile)
packages/core        Pure TS: RAG, BM25, chunking, budget, citation validation, emergency lexicon
modules/expo-zim     Kotlin Expo module over libkiwix/libzim (java-libkiwix AAR) + sealed zim:// viewer
native/kiwix         Pinned libkiwix version + checksum
scripts/             provision.ps1 (download + verify + adb push content)
e2e/                 Maestro flows
```

## Develop

```sh
pnpm install
pnpm verify          # typecheck + lint + unit tests
```

Android release build (no EAS):

```sh
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

Content (ZIM, GGUF, PMTiles) is not bundled; provision a connected device with
`scripts/provision.ps1`.

## License

GPL-3.0-or-later (required by libzim / libkiwix). See [LICENSE](LICENSE).
Not a medical device; educational content, no warranty.
