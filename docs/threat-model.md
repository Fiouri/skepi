# SKEPI threat model

Started in Phase 1c (catalog, downloads, import, viewer); Phase 1d added the structural source filter,
release guards, emergency cards, location and the tools; Phase 2a added P2P sharing, app propagation,
and the map and places packs. Updated with every feature that adds an input,
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
6. **Article text as model input** (prompt injection inside ZIM passages; see "Source text").
7. **Bundled emergency cards and numbers** (safety-critical static content).
8. **Device sensors and intents** (GNSS, compass, torch, SMS/dialler hand-off; Phase 1d).
9. **P2P transfer** (Phase 2a): a host phone on the local network (shared LAN or LocalOnlyHotspot), the
   pairing QR code, and the local APK page.
10. **Map and places packs** (Phase 2a): PMTiles parsed by MapLibre, places SQLite parsed by SQLite.

## Source text (prompt injection)

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| Injected instructions inside an article reach the model or Layer 1 | Before chunking, `sanitizeSourceText` removes **structural** injections — forged `<source>` blocks and tags, chat-template markup, JSON objects with role/system/assistant keys, role-prefixed lines (`SYSTEM:`, `[assistant]`), sentences addressed to the model/assistant/AI/summariser (vocatives, "note for …", persona assignments, answer-format orders, "this line supersedes …"); a structural hit also drops the rest of its paragraph — and the Phase 1b lexicon phrases. Paragraph breaks come from the extraction (one line per block element). | `packages/core/test/sanitize.test.ts`, `rag.test.ts` (Layer 1 and the prompt); rag-eval adversarial set (gated) and held-out section (reported) |
| An injection the filter misses | The model has no tools; every AI sentence must be supported by the cited source (bigram + number/unit checks); emergency cards never pass through the LLM. Accepted residual risk: a fact-shaped injected sentence can still appear verbatim in Layer 1, which always shows its source. | rag-eval |

## Emergency cards and numbers

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| Wrong first-aid instruction | Static cards from public-domain US federal sources with a source and locator per step; never generated; every card ships as **draft** with a permanent banner until two first-aid instructors review it; CODEOWNERS on the folder. | `packages/emergency-cards` tests (schema, sources, translation numbers) |
| Draft cards in a public release | `skepiCheckEmergencyCards` fails the release build; `-PskepiAllowDraftCards=true` for internal builds only, with a loud warning. | Gradle task; CI step "Release build must fail with draft emergency cards" |
| Wrong emergency number | Bundled per-country dataset with a documented official source per country; unknown country → 112 labelled "check the local number"; the country is chosen by the user, never from the network. Calls only open the dialler. | `numbers.test.ts` |

## Device sensors, permissions and intents

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| Permission creep in release builds | Allowlist on the release APK (`aapt2 dump permissions`): INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, and since Phase 2a exactly CHANGE_WIFI_STATE, CHANGE_NETWORK_STATE, NEARBY_WIFI_DEVICES (`neverForLocation`) and CAMERA (QR scanning only, asked on the Receive screen) (+ the app's own signature-level dynamic-receiver permission). ACCESS_BACKGROUND_LOCATION, REQUEST_INSTALL_PACKAGES and RECORD_AUDIO are forbidden. | `tools/release-guards` in CI (`android-release-guards`) |
| Location tracking | GPS provider only (no Play Services, no network location), one fix per tap, updates removed after the fix or timeout; no history stored; the compass and GNSS stop when the Tools tab loses focus or the app goes to background. | `ExpoEmergencyToolsModule`; `e2e/tools.yaml` |
| Silent SMS or calls | No SEND_SMS / CALL_PHONE permission: the app only opens the SMS app (`sms:?body=`) or the dialler (`tel:`); the user sends or calls. | permission allowlist; `run-e2e.ps1` (VIEW `sms:` intent) |
| Torch left on | The Morse player switches off on its own thread after stop, on errors and when the app goes to background. | `MorsePlayerTest` |
| Stale release bundle (old core code in a release) | Bundle task inputs include `packages/` and `modules/`; CI probe edits one file in each and requires a rebuilt bundle containing the change. | `tools/release-guards` bundle probe |

## P2P sharing (Phase 2a)

Design: `docs/architecture.md` ("P2P content sharing"); code: `packages/core/src/transfer.ts` (decisions),
`modules/expo-transfer` (sockets, TLS, hotspot, QR), `apps/mobile/src/lib/transfer.ts` (the only caller).
The receiver trusts files only through the signed catalog, never through the host.

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| **LAN attacker** reads or alters a transfer, or impersonates the host | TLS 1.3 only, per-session self-signed certificate (fresh EC P-256 key, memory only); the receiver pins the certificate SHA-256 from the QR code and trusts no CA; every request carries the 128-bit session token (constant-time compare). A broken channel still cannot change content: every chunk is checked against the signed catalog. | `TransferServerTest` (other certificate refused, TLS 1.2 refused, token required); `transfer.test.ts` |
| LAN attacker probes the host for other files | The server maps only the selected pack ids to files; no URL reaches the filesystem (`/pack/<id>` with a strict id pattern, everything else 404, GET only). Conversations, notes, settings and app.db have no route. | `TransferServerTest.neverServesUnselectedPacksOrUserData` (traversal, encoded variants, other ids, app.db) |
| **Malicious host** sends altered or malicious bytes | A pack is accepted only when SHA-256, size and kind match the receiver's signed catalog; each chunk (64 MiB; 64 KiB for test packs) is hashed natively on arrival and compared with `chunkSha256`; a bad chunk is re-requested alone, at most 3 attempts, then the pack is rejected and its partial file deleted. The whole file is hashed again before the atomic install (as for downloads). Nothing under `tmp/` is opened. | `transfer.test.ts`; E2E `p2p-receive.yaml` (`propagate`, `tampered`) |
| Malicious host sends a forged, foreign-key or older catalog | Used only when the signature verifies with the receiver's trusted keys over the exact bytes and the sequence is higher (rollback and sequence reuse rejected); otherwise packs are checked against the receiver's own catalog. | `transfer.test.ts`; E2E `bad-signature`, `rollback` |
| Malicious host offers files outside any catalog (parser exploits) | Shown as unverified, never auto-selected; only a ZIM can be taken, by explicit choice, and it stays unverified (labelled, consent before opening, JavaScript off). Models, maps and places outside the catalog are refused. | `classifyOffers` tests; app.db `CHECK (verified = 1 OR kind = 'zim')` |
| Malicious host exhausts resources | Manifest ≤ 4 MiB and ≤ 256 packs, strict schema; responses must match the requested range and length; headers ≤ 8 KiB; free-space rules as downloads. | `transfer.test.ts`, `Http.kt` |
| **Malicious receiver** abuses the host | Read-only server (GET only), 4 concurrent connections, 30 s socket timeouts; the session ends when the host stops or after 30 minutes without a request; only packs the host selected are listed. | `TransferServerTest` (idle stop, methods) |
| **QR replay** (a photographed or old QR) | Token, key and certificate are per session: a new session means a new pin and token, and the old QR stops working when the session ends (stop or 30 minutes idle). Physical proximity is the trust channel; the code is shown only on the host's Share screen. | `sessionCertificatesAreFreshAndSelfConsistent`; idle stop test |
| A QR code that points to the internet | The pairing parser and the native client accept only local-network addresses (RFC 1918, link-local, IPv6 ULA/link-local); hostnames are refused (no DNS). | `transfer.test.ts`, `clientRefusesNonLocalHosts` |
| Hotspot credentials | LocalOnlyHotspot: random SSID and WPA2 password per start, no internet; the receiver joins it as a local-only network (WifiNetworkSpecifier, the user confirms). Both end with the session. | manual (hotspot E2E pending a second physical device) |
| Fault injection reaching users | Corrupt/drop/catalog faults exist only when the module's `BuildConfig.DEBUG` is true; release builds refuse them. | `capabilities().faultInjection` |

**App propagation (APK page).** The host can serve its own APK on `http://<host>:<port>/`, the only
cleartext server (outgoing cleartext stays forbidden by the network security config). It serves `/` and
`/skepi.apk` only, never packs or user data, and only while the user shares the app. The page shows the
signing-certificate SHA-256 to compare with the published fingerprint; Android refuses later updates
signed with another key. Residual risk: a LAN attacker can replace the cleartext page for a phone that
does not have the app yet; the fingerprint check is the defence. No `REQUEST_INSTALL_PACKAGES`. Split
(store) installs cannot be shared as one APK and are refused.

## Map and places packs (Phase 2a)

| Threat | Mitigation | Verified by |
| --- | --- | --- |
| Malicious PMTiles (MapLibre parser) or places SQLite | Only packs of a valid signed catalog are opened (verified `pmtiles` / `places` packs); unknown files in `maps/` are listed as ignored and never opened; app.db forbids unverified non-ZIM packs; places packs open read-only. | `reconcile` (`rejectedMaps`), `places.yaml` |
| Injection through place search | User text becomes quoted FTS5 prefix terms (`placesMatch`); no SQL is built from input. | `places.test.ts` |
| ODbL attribution | Stored in each places pack (`meta`) and shown on the map with the basemap attribution. | `places.test.ts`, `places.yaml` |

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
| Network use outside ContentStore | Internet downloads only through `modules/expo-content-store`; local-network P2P only through `modules/expo-transfer`, called from `apps/mobile/src/lib/transfer.ts` alone (ESLint rule); ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, Node network modules and the native downloader outside `apps/mobile/src/lib/contentStore.ts` (tooling exception: `tools/catalog-builder/src/download.ts`). | `pnpm lint`; zero-egress checks |
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
`SealingTest`). Phase 1d: blackout mode adds an inline `<style>` after the CSP meta in HTML responses (inline
style was already allowed); no script source changes (`SealingTest.blackoutThemeAddsDarkCssAndKeepsTheCsp`). Unverified packs render through the same viewer with the same restrictions plus the label.

## Data at rest

app.db is SQLCipher (op-sqlite); the 256-bit key is random per install and stored with expo-secure-store
(AES key in the Android Keystore). `allowBackup=false`.

## Open items

- Catalog hosting and key-list distribution (later phase). Maps and places joined the catalog in Phase 2a;
  their mirror (GitHub release assets) is uploaded by the maintainer.
- Hotspot-mode P2P between two physical devices (only one was available in Phase 2a).
- Fuzzing of libzim / llama.cpp loaders (Phase 2 gate).
- Held-out adversarial set: used for the Phase 1d decision (structural filter); a fresh unseen set is needed
  before the public release.
- Emergency cards: review by certified first-aid instructors (release blocker).
