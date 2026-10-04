# expo-zim

Android (Kotlin) Expo module over the official `org.kiwix:libkiwix` AAR (libkiwix + libzim + Xapian).
See `native/kiwix/README.md` for the pinned version and checksum.

- `openArchive(path)`, `suggest(query, limit)`, `search(query, limit)` (Xapian full-text),
  `getArticleHtml(archiveId, path)`, `getPlainText(archiveId, path)` (jsoup; infobox/nav/references removed),
  `closeArchive(id)` — all run off the UI thread.
- `ZimArticleView`: an Expo view around `SealedWebView`, a WebView that only loads
  `zim://<archiveId>/<path>` served from open archives (`shouldInterceptRequest`). Every other request
  or navigation is refused and logged; `loadUrl`/`loadData`/`postUrl` accept only valid zim:// URLs;
  JavaScript is disabled and `addJavascriptInterface` throws; file/content access and Safe Browsing are
  off; every response (including 403/404) carries the strict CSP; path traversal is rejected.

Device probes (RAM, CPU, battery, thermal) live in `modules/expo-device-profile`.

## Sealing tests

Instrumentation tests in `android/src/androidTest` (`SealingTest`) run against a real WebView and the
fixture `android/src/androidTest/assets/sealing-fixture.zim` (source and licence in
`android/src/androidTest/fixtures/README.md`). With a device connected:

```powershell
cd apps/mobile/android
./gradlew :expo-zim:connectedAndroidTest
```

Files must live in app-specific storage with real paths (no SAF; libzim #852).
