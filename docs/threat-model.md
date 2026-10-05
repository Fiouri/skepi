# SKEPI threat model

Started in Phase 1c (catalog, downloads, import, viewer). Updated with every feature that adds an input,
a parser or a network path. Architecture context: `docs/architecture.md` ("Security", "Content pipeline").

## Assets

| Asset | Why it matters |
| --- | --- |
| Device integrity | ZIM, GGUF and PMTiles reach C/C++ parsers (libzim/Xapian, llama.cpp, MapLibre). |
| Content integrity | A modified medical article or model can cause physical harm. |
| User data | Questions, settings, later notes and places (app.db). |
| Privacy | Zero telemetry; no request may identify the device or the user. |
| Catalog signing key | Whoever holds it decides which files every device trusts. |

## Trust boundaries and entry points

1. **Signed catalog** (embedded in the APK, or a newer one from a catalog source).
2. **Downloads** from catalog mirrors (system DownloadManager, HTTPS).
3. **File import** (Storage Access Framework: USB, Files, another app).
4. **Article viewer** (HTML from ZIM files inside a WebView).
5. **Model output** (text shown to the user; covered by citation checks, `docs/architecture.md`).
6. Later: P2P transfer (Phase 2).

## Catalog

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| Forged or modified catalog (mirror, MITM, P2P) | Ed25519 signature over the **exact bytes** of `catalog.json` (`.sig` = base64 signature); nothing in the document is used before the signature verifies with a trusted key named by `keyId`. The JSON is never re-serialised before checking. | `packages/core/test/catalog.test.ts` (one flipped byte anywhere, re-serialised JSON, tampered signature); E2E `e2e/download.yaml` (tampered byte rejected on the phone) |
| Signature by an unknown key, or a key claiming a pinned id | Only pinned keys (active + offline backup) or keys from an accepted key list are trusted; the signature must verify with the named key. | unit tests (rogue key with a pinned id, unknown id); E2E wrong-key case |
| Rollback to an older catalog (re-enable a revoked file) | `sequence` must not go below the highest accepted one (stored in app.db); the same sequence with other content is rejected (`sequence_reuse`). No wall-clock time involved. | unit tests; E2E rollback case |
| Malformed catalog after a valid signature (signer bug) | Strict schema: no unknown fields, HTTPS mirrors without query strings, 64-hex hashes, chunk count = ceil(size / 64 MiB), safe file names with the right extension, unique ids and files. | unit tests |
| Signing key theft | Key generated and kept **outside the repository**, offline, never in CI (`tools/catalog-builder` refuses key paths inside the repo). A backup key, kept separately, can sign a key list that rotates the active key out. | `tools/catalog-builder/test` |
| Test key reaching users | Debug builds embed a test catalog and test keys; release builds embed only release keys, and the release build **fails** unless `catalog/embedded/release` verifies with `catalog/keys/release.json` (purpose `release`, keys different from the test keys). | `skepiCheckReleaseCatalog` Gradle task |
| Loss of app.db (e.g. Keystore reset) | The database is recreated; the anti-rollback floor falls back to the embedded catalog's sequence. Accepted risk: an attacker would also need a validly signed older catalog. | — |

**Key rotation.** `catalog keylist` signs a key list (`keys.json` + `.sig`) with the key it replaces (or the
backup). The app accepts it only when the signer is trusted and the list's sequence does not roll back; from
then on exactly the listed keys are trusted. Verify path implemented and unit-tested in Phase 1c; distribution
of key lists arrives with catalog hosting.

## Downloads

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| Corrupt or malicious file from a mirror | Download to `tmp/<file>.partial`; streaming SHA-256 on a native thread (`modules/expo-hash`); only a file whose hash and size match the signed catalog is moved into place (atomic rename) and registered. A mismatch deletes the file and tries the next mirror. Nothing under `tmp/` is ever opened by libzim or llama.cpp. | E2E: corrupt first mirror → next mirror; corrupt everywhere → rejected, never installed |
| Downgrade to HTTP / MITM | HTTPS only (ContentStore and catalog schema); network security config forbids cleartext and trusts only system CAs. DownloadManager uses the app's network security config. Integrity does not depend on TLS (signed hashes). | `ContentRulesTest`; unit tests |
| Tracking through requests | Generic `User-Agent: SKEPI` (DownloadManager's default contains the device model), no query strings, no device identifiers; URLs come only from the signed catalog. | mirror log in `e2e/run-download-e2e.ps1` |
| Network use outside ContentStore | INTERNET comes only from `modules/expo-content-store`; ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, Node network modules and the native downloader outside `apps/mobile/src/lib/contentStore.ts` (tooling exception: `tools/catalog-builder/src/download.ts`). | `pnpm lint`; zero-egress checks |
| Unexpected egress | Offline E2E (airplane mode): zero ContentStore requests and zero bytes for the app's UID on any real interface (`dumpsys netstats`). Download E2E: requests only to `127.0.0.1:8443` (the local mirror via `adb reverse`) and zero bytes on real interfaces. | `e2e/run-e2e.ps1`, `e2e/run-download-e2e.ps1` |
| Mobile data cost | Wi-Fi only by default; on a metered network the size is shown and the user confirms. | Library screen |
| Disk exhaustion | Free space ≥ size + 10% + 1 GB before a download starts. | `ContentRulesTest` |
| Debug trust leaking into release | The test mirror CA is trusted only by debug builds and only for `127.0.0.1`; its private key was deleted after issuing the mirror certificate. | `plugins/withContentStore.js` (debug source set only) |

## File import

| Threat | Mitigation |
| --- | --- |
| Malicious ZIM from USB / another app | Copied into app storage (libzim needs a real path), hashed, looked up in the catalog. Unknown ZIM = **unverified**: never opened without explicit consent, permanently labelled ("Unverified content — not in the signed catalog") in search results, articles and Ask sources; JavaScript stays off (the viewer never enables it). |
| Malicious GGUF (llama.cpp parser) | Unverified GGUF files are rejected (import) and never loaded (provisioned files that match no catalog entry are listed as rejected). The database forbids unverified non-ZIM packs (`CHECK`). |
| Path tricks in names | Files are stored under generated names (`import-<sha>.zim`); content paths are canonicalised and restricted to `zim/ models/ maps/ tmp/` (`ContentRules.resolve`). |

## Article viewer

Unchanged from Phase 1a (sealed `zim://` WebView, JS off, strict CSP, no JS bridge, path traversal rejected;
`SealingTest`). Unverified packs render through the same viewer with the same restrictions plus the label.

## Data at rest

app.db is SQLCipher (op-sqlite); the 256-bit key is random per install and stored with expo-secure-store
(AES key in the Android Keystore). `allowBackup=false`.

## Open items

- Catalog hosting and key-list distribution (later phase); maps (PMTiles) join the catalog then.
- Fuzzing of libzim / llama.cpp loaders (Phase 2 gate).
- Held-out adversarial results (`docs/phase-1c-report.md`): injected instructions that the sanitizer lexicon
  does not match stay visible in Layer 1 passages (verbatim source text). Decision pending.
