# expo-zim

Android (Kotlin) Expo module over the official `org.kiwix:libkiwix` AAR (libkiwix + libzim + Xapian).
See `native/kiwix/README.md` for the pinned version and checksum.

- `openArchive(path)`, `suggest(query, limit)`, `search(query, limit)` (Xapian full-text),
  `getArticleHtml(archiveId, path)`, `getPlainText(archiveId, path)` (jsoup; infobox/nav/references removed),
  `closeArchive(id)` — all run off the UI thread.
- `ZimArticleView`: a native WebView that only loads `zim://<archiveId>/<path>` served from the archive
  (`shouldInterceptRequest`). Every other scheme is blocked and logged; JavaScript is disabled; every
  response carries a strict CSP.

Files must live in app-specific storage with real paths (no SAF; libzim #852).
