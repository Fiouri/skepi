# Changelog

All notable changes. Versions follow [Semantic Versioning](https://semver.org/); pre-releases carry a
suffix. Phase reports in `docs/` have the details and the measurements.

## [0.1.0-preview] — Developer Preview (Android + Windows)

First public build, for developers and testers. **Not for emergency use.**

### Added
- **Android app** (arm64): offline Wikipedia search and sealed article viewer, Ask with source excerpts
  (Layer 1) and an on-device AI summary (Qwen2.5-1.5B) with verified citations, Greece map and places
  packs with emergency points, emergency numbers per country, SOS torch, compass, GPS position,
  blackout mode, phone-to-phone sharing (QR pairing, pinned TLS, every chunk verified).
- **Windows app** (Tauri 2, x64): the same features with libzim 9.7.0 and llama.cpp (Vulkan GPU or
  CPU), SQLCipher storage with a DPAPI-protected key, a user-chosen content folder, and **Station
  mode** (shares selected packs with many phones on the local network).
- Signed content catalog (Ed25519, offline key, anti-rollback); release catalog sequence 3 propagates
  from the desktop Station to phones.
- About screen on both apps: licence, content/data/model licences, generated third-party notices
  (JavaScript, Rust, Android, native), release signing fingerprint, privacy statement.
- "Report a problem with this answer": prepares a text with the question, what was shown, the cited
  sources and the app version, to copy or save; nothing is sent.
- Developer Preview build mode: emergency cards ship without their steps ("Under professional
  review") plus the emergency numbers; a permanent "Developer preview — not for emergency use" label.
  The bundles are checked for card text at build time.

### Security
- AI sentences with a web or e-mail address are never shown; comment-like spans are removed from
  source text; tables written as text are split into cells that are never highlighted on their own;
  Layer 1 is labelled "Source excerpts — not verified advice" (held-out adversarial set 2 decision).
- WebView2 runtime egress removed on Windows (Microsoft-account integration and background services
  off); measured online, idle and in use: no connection outside the computer.

### Known limitations
- Tested on a Samsung Galaxy S23 (Android 16) and Windows 11 x64 only. English only. Greece map only.
- Emergency card steps await professional review. Windows installers are not code-signed.
- Layer 1 shows source text verbatim; source integrity relies on the signed catalog of official packs.
