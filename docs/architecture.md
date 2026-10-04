# Project S.K.E.P.I. — Architecture

**S.K.E.P.I.** = **S**urvival **K**nowledge & **E**mergency **P**ocket **I**ntelligence. *Skepi* (σκέπη) is Greek for shelter, protection.

> Status: Phase 0 complete (GO). This file is the source of truth for Claude Code. The two diagrams of the Claude Doc are rendered here as text.

## Vision and principles

An open-source, mobile-first app that provides Wikipedia, medical and survival knowledge, maps and an AI assistant with no connectivity after the initial download. It runs on Android, iOS, Windows and macOS using open formats, so the same content moves from device to device.

**Goals**

- The library and maps work on a 4 GB RAM phone, without AI.
- The AI answers only from sources on the device and shows them in every answer.
- Content is shared device-to-device without internet.
- Zero telemetry; no connection without an explicit user action.
- English-first product (UI default, content, docs). Greek is the first additional locale, shipped in v1.

**Non-goals**

- Not a Docker server like NOMAD. Every device is self-sufficient.
- No proprietary content format. We use ZIM, GGUF and PMTiles.
- Not a medical device and no diagnosis. The AI is a search-and-summarise tool.
- No accounts, no cloud sync, no backend.

**Design principles**

1. **Offline by default.** The network is used only to download content, and only when the user asks.
2. **Knowledge first, AI second.** Every feature works with the LLM off.
3. **Answers only with sources.** If no source is found, the app says so and does not improvise.
4. **Battery is a survival resource.** Every choice is also judged by its cost in mWh.
5. **Verifiable content.** Every file has a signed hash, whether it came from the internet or another phone.
6. **Open formats.** A ZIM downloaded here opens in Kiwix or NOMAD, and vice versa.

## Platforms and tech stack

Two shells over one shared TypeScript core. Mobile runs Expo/React Native, desktop runs Tauri 2. The heavy parts (inference, ZIM, maps) are the same C/C++ engines everywhere, with a different binding per platform.

| Component | Android / iOS | Windows / macOS | Why |
| --- | --- | --- | --- |
| UI shell | Expo (dev build, New Architecture) | Tauri 2 with React in the webview | Mobile is the primary target. Tauri gives a small binary and Rust for native work. |
| Shared logic | `packages/core` (TS strict) | same | RAG, catalog, verification, prompts and i18n written once. |
| LLM inference | llama.rn (llama.cpp, Metal on iOS) | llama.cpp in-process via Rust (Vulkan / Metal / CUDA) | One model format (GGUF) everywhere. In-process avoids a local HTTP server. |
| Library | libkiwix + libzim via Expo native module (Kotlin / Swift) | libzim via Rust FFI | Official ZIM implementation with built-in Xapian index. |
| Article viewer | Native viewer inside `expo-zim` (platform WebView driven natively) | Tauri webview with custom protocol | react-native-webview cannot serve a custom `zim://` scheme without patching on both platforms (Phase 0 finding). |
| Maps | MapLibre Native (RN) | MapLibre GL JS in the webview | Reads local PMTiles with no tile server. |
| Local DB | SQLite (op-sqlite, SQLCipher) | SQLite via Rust (rusqlite) | Same shared SQL migrations. |
| Crypto | @noble/ed25519, @noble/hashes | same (in core) + ring in Rust | Audited, dependency-free libraries. SHA-256 of large files runs natively. |
| Monorepo | pnpm workspaces + Turborepo | same | Expo supports pnpm monorepos well. |

libkiwix for Android comes from the official package on Maven Central (validated in Phase 0). For iOS/macOS, kiwix-build produces CoreKiwix.xcframework. We write bindings, not parsers.

Rejected: Tauri for all platforms (mobile is less mature for native maps and background downloads, and we would lose llama.rn); React Native Windows (llama.rn does not support Windows).

## High-level architecture

Layers, top to bottom:

1. **UI:** Mobile app (Expo / React Native · Android, iOS) and Desktop app (Tauri 2 + React · Windows, macOS).
2. **packages/core (TypeScript, shared):** RAG · safety layer · catalog verification · pack manager · guards · i18n.
3. **Adapters (interfaces from packages/contracts):**
   - Expo native modules: expo-zim (Kotlin / Swift, incl. native viewer) · llama.rn · MapLibre Native · expo-transfer · SQLCipher.
   - Rust (src-tauri): zim-ffi · llama.cpp (Vulkan / Metal) · MapLibre GL JS · transfer · rusqlite.
4. **Native engines (C/C++), same everywhere:** llama.cpp · libkiwix / libzim + Xapian · MapLibre · SQLite.
5. **Local storage:** ZIM · GGUF · PMTiles · places DB · app.db (encrypted).
6. **Content inputs (every file is SHA-256 verified before opening):**
   - Signed catalog + mirrors (Kiwix · Hugging Face · Protomaps), during preparation only.
   - Another device (P2P): LAN / hotspot · QR pairing · TLS, no internet.

The UI talks only to `packages/core`. Core talks to engines only through interfaces, and content enters only through the two input points, verified.

## Monorepo layout

Platform-specific code lives behind an interface from `packages/contracts`, so core is testable in Node without a phone.

```
/apps
  /mobile            Expo app (Android + iOS), expo-router, UI and wiring only
  /desktop           Tauri 2: src-tauri (Rust) + web UI (React, Vite)
/packages
  /core              Domain, RAG orchestrator, safety layer, catalog/verify, pack manager
  /contracts         TS interfaces: KnowledgeEngine, InferenceEngine, ContentStore, TransferService, DeviceProfile
  /db                SQL migrations + typed queries (shared mobile/desktop)
  /i18n              English (default) / Greek strings
  /emergency-cards   Curated static emergency cards (Markdown + sources), English master + translations
  /ui-tokens         Colours, typography, blackout theme
/modules
  /expo-zim          Kotlin + Swift binding over libkiwix/libzim, plus the native article viewer
  /expo-device-profile  RAM, thermal state, battery, free storage
  /expo-transfer     Local hotspot, QR pairing, TLS server/client for P2P
  /expo-hash         Streaming SHA-256 on a native thread
/crates
  /zim-ffi           Rust FFI to libzim (cxx)
  /desktop-core      Inference, ZIM, hashing, transfer for Tauri
/native
  /kiwix             Pinned versions + checksums (Maven AAR, xcframework, Windows libs)
/tools
  /catalog-builder   Builds, signs and publishes catalog.json
  /rag-eval          Answer evaluation against golden sets
  /bench             Benchmarks: tokens/s, latency, energy
/docs                Architecture, ADRs, threat model, SECURITY.md, phase reports
```

**Dependency rules**

- `core` depends only on `contracts`, never on React, Expo or Tauri.
- `apps` provide the interface implementations (adapters) and inject them into core.
- Network access exists only in `ContentStore.download`; a lint rule forbids `fetch` anywhere else.
- Every native library has a pinned version and checksum in `/native`. Upgrades go through a PR with green CI.

**Core interfaces (`packages/contracts`)**

```ts
export interface KnowledgeEngine {
  openArchive(file: PackFile): Promise<ArchiveInfo>;
  search(query: string, opts: SearchOptions): Promise<SearchHit[]>;
  getArticle(archiveId: string, path: string): Promise<Article>;
  getPlainText(archiveId: string, path: string): Promise<ArticleText>;
  closeArchive(archiveId: string): Promise<void>;
}

export interface InferenceEngine {
  load(model: InstalledModel, opts: LoadOptions): Promise<LoadedModel>;
  generate(req: GenerateRequest, onToken: (t: string) => void, signal: AbortSignal): Promise<GenerateResult>;
  embed?(texts: string[]): Promise<Float32Array[]>;
  unload(): Promise<void>;
}

export interface ContentStore {
  listInstalled(): Promise<InstalledPack[]>;
  download(entry: CatalogEntry, signal: AbortSignal): AsyncIterable<DownloadProgress>;
  importFile(uri: string): Promise<InstalledPack>;
  verify(pack: InstalledPack): Promise<VerifyResult>;
  remove(packId: string): Promise<void>;
}

export interface DeviceProfile {
  snapshot(): Promise<{ totalRamMb: number; freeRamMb: number; freeDiskMb: number;
    batteryPct: number; charging: boolean; thermal: 'nominal' | 'fair' | 'serious' | 'critical' }>;
}
```

## AI engine

The LLM is optional, loads only when needed, and its size is chosen automatically from the device profile. Every model in the catalog is Apache-2.0 or MIT, so it can be shared device-to-device legally.

**Device tiers** (to be confirmed with `/tools/bench` on real devices)

| Tier | Device | Model | Context | Behaviour |
| --- | --- | --- | --- | --- |
| T0 | < 4 GB RAM | None | — | Search, articles, maps, cards only |
| T1 | 4–6 GB RAM | ~1–2B, Q4_0 | 2048 | Extractive answer by default; AI summary on demand |
| T2 | 8–12 GB RAM | ~3–4B, Q4_0 | 4096 | Extractive answer + automatic AI summary, optional embedding rerank |
| T3 | Desktop with GPU or 16 GB+ | ~7–9B, Q4/Q5 | 8192 | Longer syntheses, more articles per answer |

**Test devices.** Current reference: Galaxy S23 (8 GB, T2). All T1 gates stay **pending** until a 4 GB device is available. Until then, the app has a **T1-simulation mode** (T1 model, 2 threads, context 2048, T1 budget) used on the S23 to catch large regressions early; a 4 GB Android emulator covers functional (not performance) checks.

**Model selection.** Default family: small Qwen models. The exact model is chosen by `/tools/rag-eval` (English primary set, Greek secondary set), not by reputation. rag-eval also reports **tokens per character** per language: a tokenizer that is efficient for a language directly cuts latency. A new model ships only if it does not regress citation precision or refusal-when-no-source.

**Model lifecycle**

1. **Load:** lazy, on the first AI request. Free RAM is checked first (`loadLlamaModelInfo` + `DeviceProfile`); if it does not fit, a smaller model is proposed.
2. **Run:** tokens stream to the UI with a stop button. The system prompt's KV cache is reused. Temperature 0.2, answer limit ~150 tokens (configurable).
3. **Unload:** after 2 minutes idle, when the app goes to background, or on memory warning (`onTrimMemory` / `didReceiveMemoryWarning`).

**Inference settings**

- Threads = performance cores, not all cores.
- mmap on, mlock off on mobile.
- Q4_0 quantization on mobile (22% faster than Q4_K_M on the S23 in Phase 0).
- Metal on iOS. Android: CPU by default; GPU/NPU backends behind a feature flag and tested as a Phase 1 experiment.
- Desktop: automatic GPU offload, Vulkan on Windows, Metal on macOS.
- Structured outputs are constrained with GBNF grammar so JSON is always valid.

**Guards before every generate**

| Condition | Action |
| --- | --- |
| Thermal `serious` | Half the threads, half the token limit |
| Thermal `critical` | Refuse with a message; offer search instead |
| Battery < 20% and not charging | Confirm with the measured cost (% battery per answer) |
| Blackout mode on | AI off by default; opens per request |
| Free RAM < model size + 25% | Do not load; propose a smaller tier |

Cost per answer is measured on the device (battery delta and duration) and stored locally, so the estimate is real, not theoretical.

## Knowledge library (ZIM)

All knowledge lives in ZIM files read by libkiwix over libzim. Search uses the Xapian index already inside each file; no on-device indexing.

**Two-speed search**

- **Title suggestions** while typing (SuggestionSearcher). Target p95 < 50 ms.
- **Full-text** on Enter (Searcher + Xapian) across all open archives, filterable by pack and language. Target p95 < 300 ms on T1.
- The home search queries articles, emergency cards and map place names at once.

**Sealed article reading (native viewer in expo-zim)**

- The viewer loads only from a custom scheme (`zim://<archiveId>/<path>`), served by native handlers: `shouldInterceptRequest` on Android, `WKURLSchemeHandler` on iOS.
- Every http(s), file or intent request is blocked. External links are shown as text marked "external" and never open automatically.
- JavaScript is off by default. If a pack needs it (video, maths), it is enabled per pack with a warning.
- Every response carries a CSP header: `default-src 'none'; img-src zim: data:; style-src zim: 'unsafe-inline'; font-src zim:; media-src zim:`.
- Blackout theme injects dark CSS with pure-black background for OLED.
- Because this is our own code (not a library), its guarantees are covered by instrumentation tests: other schemes blocked, JS disabled, CSP present on every response, path traversal (`zim://…/../`) rejected.

**Text for RAG**

HTML is converted to text natively (jsoup on Android, SwiftSoup on iOS, scraper in Rust), keeping section structure (`{ heading, level, text }[]`). Infoboxes, navboxes, references and "See also" are stripped. Results are kept in a small in-memory LRU cache.

**Files on disk**

- **Android:** app-specific external storage (`getExternalFilesDir`), no permissions. SD card via the card's app-specific directory (`getExternalFilesDirs`), still a real path. Files from the Storage Access Framework are **copied** into the app, because opening a ZIM from an fd only breaks the Xapian index (libzim #852).
- **iOS:** Application Support with `isExcludedFromBackup`. Import via the Files app.
- **Desktop:** user-chosen folder, external drives supported (a USB stick becomes a portable library).

**First-release packs** (size shown in the catalog)

- English Wikipedia: small edition (top articles) and no-pictures edition. Default.
- WikiMed, Kiwix's medical encyclopedia. Default.
- Wikivoyage, for local information and travel.
- Locale packs: e.g. Greek Wikipedia (no-pictures and full), suggested when the device language is Greek.
- Our own "Survival" pack in ZIM format, from public-domain or openly licensed material (government manuals, civil-protection guides), built with zim-tools.

## RAG pipeline and grounding

Every answer comes in **two layers**, both built only from passages found on the device. All logic lives in `packages/core` and is identical on all platforms.

- **Layer 1 — extractive answer (instant, no LLM).** The best passages from the sources, with the relevant sentences highlighted. Always correct, because it is verbatim source text. Primary answer on T1 and in blackout mode. Target < 1 s on T1.
- **Layer 2 — AI summary.** Streams after Layer 1. Automatic on T2+, on demand ("Summarise with AI") on T1.

**Pipeline**

1. **Language:** detected deterministically from the script (no model).
2. **Emergency intercept:** a fixed lexicon per language (bleeding, CPR, choking, burn, poisoning…) checks the query. On a match, the curated card and the emergency number are shown immediately, before anything else. It does not wait for the LLM.
3. **Query rewrite (T2+ only):** the LLM with GBNF outputs `{ queries: { lang: string, terms: string[] }[], intent }`, so a query in one language also searches packs in the others (English packs are the richest). On T1, the query without stopwords is used.
4. **Retrieval:** Xapian full-text in each open pack, top 8 articles per pack, merged with reciprocal rank fusion (scores across indexes are not comparable).
5. **Passage selection:** sections are cut into ~200–300 token chunks and ranked with BM25 over the small candidate set. On T2+, optional rerank with a small multilingual embedding model.
6. **Context budget, in characters:** budgets are set in characters per language and converted with the measured tokens-per-character of the active model (Phase 0: Greek ≈ 1 token per character, about 4× English). Preference for diversity across articles.
7. **No source:** if the best score is below the calibrated threshold, show "No relevant source found" with the search results. No generation.
8. **Prompt and output format:** passages are wrapped in `<source id="S1" title="…">…</source>`. The model must answer in a fixed JSON format where every sentence names its source id (free-form citing failed in Phase 0: the small model never cited on its own). Source text is data, not instructions. Prompts are versioned and covered by rag-eval.
9. **Post-validation (per sentence):**
   - Citation ids that do not exist are dropped.
   - Support check uses content **bigrams**, not single words, with a calibrated threshold. Unsupported sentences are removed.
   - Any number with a unit (mg, ml, °C, minutes, tablets…) must appear verbatim in the cited source; otherwise the sentence is **removed**, not just shaded.
   - An answer left with no supported sentence is not shown; Layer 1 stays.
10. **Display:** each sentence carries a tappable `[S1]` chip that opens the article at the section. If source and answer languages differ, the chip says so and offers the original text.

**Medical intent:** the card, the emergency number and Layer 1 are shown. The AI summary is available only by tap and is labelled "unverified AI summary — check the source". Every AI answer carries a short fixed label "AI summary — check the source".

**Why not a vector index of all of Wikipedia:** embeddings for millions of chunks would take many GB and hours on a phone. Xapian is already in the ZIM and covers recall. Embeddings are only for reranking a few dozen chunks. Small curated packs (Survival, WikiMed) may ship precomputed embeddings later.

**Prompt injection:** the model has no tools that act, so a malicious article can at most affect the text of one answer, which the user can see through the citation. That is why "answers only with sources" is also a security measure.

## Offline maps

Maps are vector tiles in one PMTiles file per region, rendered by MapLibre directly from disk, with no tile server or network request. MapLibre Native supports local `pmtiles://file://` on Android from 11.7.0 and on iOS from 6.10.0; maplibre-react-native currently wraps Android 13.2.0 / iOS 6.26.0. Validated offline on Android in Phase 0 (render 327 ms with Greek labels); iOS still needs one test with a local file on a real iPhone.

| Component | Implementation |
| --- | --- |
| Map data | Protomaps basemap (OpenStreetMap), cut per country or region with `pmtiles extract` in the catalog-builder |
| Style, fonts, sprites | Bundled. Fonts cover Latin, Greek and the scripts of shipped locales. Style rewritten at runtime with absolute file paths. |
| Place search | Small SQLite FTS5 per region (name, name:en, name:<locale>, type, coordinates) from OSM, built in the catalog-builder |
| Emergency POIs | Hospitals, pharmacies, fire stations, police, water sources, shelters, as a separate filterable layer |
| User position | GNSS works without internet (first fix without A-GPS is slower). Accuracy and coordinates shown for copying or sending by SMS. |
| User places | Meeting points, water sources and notes in SQLite. Export to GeoJSON and share via P2P. |
| Desktop | MapLibre GL JS in the webview; pmtiles JS reads through a custom Tauri protocol serving range requests from disk. |

**Permissions and energy:** location "while in use" only, never background. GPS runs only with the map open. In blackout mode, no continuous tracking; update on tap.

**Out of scope:** turn-by-turn navigation (Organic Maps and CoMaps already do it well).

## Content pipeline

Every file the app opens (ZIM, GGUF, PMTiles, places DB) corresponds to an entry in a signed catalog with SHA-256, whether it came from a mirror, another phone or USB.

**Catalog**

```json
{
  "schema": 1,
  "sequence": 42,
  "issuedAt": "2026-10-01T00:00:00Z",
  "keyId": "cat-2026a",
  "packs": [
    {
      "id": "wikipedia_en_top_nopic",
      "kind": "zim",
      "version": "2026-09",
      "title": { "en": "Wikipedia top articles (no images)", "el": "Wikipedia κορυφαία άρθρα (χωρίς εικόνες)" },
      "lang": ["en"],
      "sizeBytes": 0,
      "sha256": "…",
      "chunkSize": 67108864,
      "chunkSha256": ["…"],
      "urls": ["https://download.kiwix.org/zim/…", "https://mirror.example/…"],
      "license": "CC-BY-SA-4.0",
      "attribution": "Wikipedia contributors",
      "minTier": "T0",
      "tags": ["encyclopedia"]
    }
  ]
}
```

- Ed25519 signature in a separate `catalog.json.sig`, over the exact bytes (not re-serialised JSON).
- Two public keys pinned in the app: one active, one offline backup. A new key is accepted only via a key list signed by the old key.
- `sequence` always increases. The app rejects a catalog with a lower `sequence` than the one it holds (anti-rollback). No reliance on wall-clock time offline.
- The build ships an embedded catalog, so a phone that never touched the internet can verify packs received via P2P.
- Hashes are computed by `/tools/catalog-builder` after downloading from the official source. The private signing key never enters CI.
- Hosting: our own domain CNAME'd to GitHub Pages, with a raw GitHub fallback in the app.

**Downloads**

- **Android:** system `DownloadManager` (resumes after interruption and reboot, honours Wi-Fi-only; avoids dataSync foreground-service limits).
- **iOS:** background `URLSession`.
- **Desktop:** Rust downloader with HTTP Range and per-chunk checks.
- Wi-Fi only by default; on metered networks show size and ask.
- Free-space check: size + 10% + 1 GB always kept free for the OS.

**Atomic install**

1. Download to `<id>.partial`.
2. Streaming SHA-256 on a native thread, with progress.
3. On match: rename and register in SQLite in one transaction.
4. On mismatch: delete and try the next mirror. No unverified file is ever opened by libzim or llama.cpp.
5. Updates download beside the old version; the old one is deleted only after the swap. If space is short, the user explicitly chooses "delete the old one first".

**File import:** files from USB, Kiwix or Files are hashed and looked up in the catalog. Match = "verified". Otherwise "unverified": opens only by explicit choice, with a permanent label and JavaScript always off. Unverified GGUF files are not accepted on mobile in v1.

## P2P content sharing

A phone with content becomes a distribution station over local Wi-Fi, without internet. The receiver trusts files only through the signed catalog's hashes, never through the sender.

**Network**

| Scenario | How |
| --- | --- |
| A router is on, no internet | Shared LAN; the host listens on its local IP |
| No router, Android host | `LocalOnlyHotspot` (SSID + password, no internet) |
| No router, iPhone host | iOS cannot open a hotspot from an app; the iPhone joins as receiver (`NEHotspotConfiguration` with the QR credentials) |
| Desktop as "Station" | LAN server serving many phones at once, like NOMAD's role |

Bluetooth is too slow for GB. Wi-Fi Direct and Multipeer were rejected because they only work between devices of the same platform.

**QR pairing:** the host shows `{ v, ssid?, psk?, host, port, token, certSha256 }`.

- `token`: 128-bit, valid for this session only; expires at the end or after 30 minutes idle.
- TLS 1.3 with a per-session self-signed certificate, pinned by `certSha256` from the QR (no MITM on the LAN).
- The QR is read only up close; physical proximity is the trust channel.

**Protocol (HTTPS, read-only)**

- `GET /manifest`: host packs (id, version, sha256) and its signed catalog.
- `GET /pack/:id`: with HTTP Range for resume.
- `GET /app.apk`: Android hosts only.
- The host serves only the packs it selected; never conversations, notes or settings.

**Receiver verification**

1. A host catalog with a valid signature and higher `sequence` is accepted, so catalogs also propagate phone to phone.
2. Each 64 MB chunk is checked against `chunkSha256` on arrival; a bad chunk is re-requested alone.
3. Same atomic install as internet downloads.
4. Packs not in any valid catalog are shown as "unverified" and never auto-selected.

**App propagation (Android only):** the host serves its own APK with the signing-certificate fingerprint; a phone without the app opens `http://<host>:<port>/` in any browser. iOS does not allow sideloading.

## Security

The biggest risk is a malicious file (ZIM, GGUF, PMTiles) reaching a C++ parser. The central defence: nothing opens without a signed hash. The threat model lives in `/docs/threat-model.md` and is updated with every feature.

**What we protect:** device integrity, content integrity (a wrong medical instruction = physical harm), and user data (questions, notes, map places).

| Threat | Mitigation |
| --- | --- |
| Malicious ZIM, GGUF or PMTiles (parser exploit) | Opens only if the hash matches the signed catalog. Unverified files only by explicit choice (GGUF never on mobile). llama.cpp and libzim pinned and updated via Renovate; first fuzzing targets. |
| Tampered content via mirror, MITM or P2P | Ed25519 catalog with pinned keys, SHA-256 per file and chunk, `sequence` anti-rollback |
| Theft of the catalog signing key | Key kept offline (hardware key or offline machine), never in CI; backup key and rotation procedure |
| XSS or data leak from article HTML | Native viewer: `zim://` only, JS off, strict CSP, no JS bridge, no file:// or network; covered by instrumentation tests |
| Prompt injection via articles | No LLM tools; answers always with sources; emergency cards never pass through the LLM |
| Attacker on the local network during P2P | Session token, TLS pinned from the QR, read-only server for selected packs, auto-close |
| Physical access or device seizure | SQLite encrypted with SQLCipher (key in Keystore/Keychain); optional biometric lock; one-tap "clear history" |
| Network leaks to third parties | Network only via `ContentStore` to catalog hosts; no analytics SDK, no Google Play Services for location; a test asserts zero egress |
| Supply chain | Lockfiles, pinned hashes for native artifacts, source builds for releases; GitHub artifact attestations and published SHA-256 |
| Forged APK in circulation | Release keystore outside the repo; signing fingerprint published in README and site; Android rejects updates with a different signature |

**Code rules**

- Every native call is bounds-checked (path traversal in `zim://`, max response size, timeouts).
- Android components `exported=false` except the launcher; network security config without cleartext, except the local APK server.
- Tauri with narrow capabilities: only needed commands, no shell, fs scope limited to the content folder.
- `SECURITY.md` describes private vulnerability reporting via GitHub private advisories.
- **Release signing:** the Expo `debug.keystore` used in Phase 0 is for development only. Release builds use a dedicated keystore kept outside the repo, read via `~/.gradle/gradle.properties`, generated once by the maintainer with `keytool`, backed up with its password in a password manager.

## Privacy

Nothing leaves the device: no account, backend, analytics or third-party crash reporting. The only egress is content downloads started by the user.

- **Download requests:** only the file URL, no device identifier, generic User-Agent, no query strings.
- **Errors:** local rotating log (~1 MB); the user exports it manually after seeing its content. Never contains query text or coordinates.
- **Location:** no location history; only places the user saves explicitly.
- **AI history:** "save conversations" toggle (on by default) and one-tap delete all.
- **Permissions:** minimal — network, location while in use, camera only for QR, flashlight for SOS; no contacts or photos.
- **Store forms:** "no data collected" on Play Data Safety and Apple Privacy Nutrition Label; true only while the zero-egress test passes.

## Performance, energy and blackout mode

Targets are measured on a T1 reference device (4 GB Android). A PR that regresses a target by more than 10% does not merge. Until a T1 device is available, T1 targets are **pending** and tracked on the S23 (T2) plus T1-simulation mode.

| Metric | Target | Phase 0 result (S23, T2) |
| --- | --- | --- |
| Cold start to search, no model | < 2 s (T1) | not measured |
| Title suggestions, p95 | < 50 ms (T1) | 9–15 ms ✓ |
| Full-text search, p95 | < 300 ms (T1) | 8–19 ms ✓ (103k and 384k articles) |
| Article open | < 500 ms (T1) | 321 ms ✓ |
| Map render | — | 327 ms ✓ |
| Layer 1 (extractive) answer | < 1 s (T1) | new in Phase 1 |
| Sources visible | < 2 s (T1) | new in Phase 1 |
| First AI token | < 15 s (T2); T1 set after measurement | 12–18 s ✗ (old gate 4 s, Greek, Q4_K_M) |
| Model load | < 10 s (T1) | not reported |
| APK per ABI (arm64) | < 80 MB | 55.3 MB ✓ (from 146.5 MB) |

**Memory**

- On T1 the model and the map are never resident together: opening the map unloads the model.
- libzim cluster cache is capped per tier.
- One article viewer per screen, not one per tab.

**App size:** ICU data is excluded (ADR: identical results for English and Greek with and without it; saves 32 MB). Any new locale must be re-tested without ICU before shipping. Only 3 of 7 llama.rn library variants ship; native libraries are compressed. App Bundle with ABI splits, arm64 primary.

**Blackout mode**

One tap from the home screen; suggested automatically when battery drops below 30% without charging.

- Pure-black theme (OLED), no animations, dark CSS in articles.
- AI off; opens per request with the cost shown. Layer 1 answers remain.
- GPS on tap only; zero background work.
- A card with phone power-saving tips (airplane mode, brightness, OS battery saver).
- Every costly button shows the measured estimate (e.g. "≈ 1% battery").

**Desktop:** the "station" powered by a UPS or portable power station, with an AI power cap (threads, GPU layers) and a "library and distribution only" mode.

## User safety (medical and survival content)

In an emergency, first-aid instructions are never generated by the LLM. A 1–4B model will invent doses and steps. Critical content is static, sourced and human-reviewed; the AI only points to it.

**Emergency cards (`packages/emergency-cards`)**

- Initial topics: CPR, bleeding, choking, burns, fractures, hypothermia, heatstroke, poisoning, water purification, earthquake, fire, flood.
- Each card: numbered steps, "when to call for help", public-domain or openly licensed source, review date.
- Written in English first, then translated (Greek first). Every change needs review by people with first-aid training (CODEOWNERS on the folder) — the only folder with a mandatory external reviewer.
- Bundled in the app, no pack dependency; available from the first second after install.

**AI rules**

- Emergency keywords show the card and the emergency number first, then anything else.
- Medical intent: card + number + Layer 1 by default; AI summary only on tap, labelled unverified.
- Numbers with units must appear verbatim in the cited source, or the sentence is removed.
- No doctor persona in the system prompt.

**Emergency numbers:** per country, bundled. Default 112 (EU and many other countries). Example, Greece: 112, EKAB 166, Fire 199, Police 100. Country chosen at onboarding, not from the network. The app never promises that 112 works without a SIM.

## UX and emergency features

Two moments of use: **preparation** (online; the user chooses and downloads) and **crisis** (offline, in a hurry, low battery). Anything critical in a crisis is at most two taps away.

**Navigation (5 tabs)**

| Tab | Content |
| --- | --- |
| Search | One field for articles, cards and places; a permanent "Emergency" button above it |
| Ask | AI conversation with sources (Layer 1 + Layer 2). Hidden on T0. |
| Map | Map, position, emergency POIs, user places |
| Tools | Emergency cards, SOS light, compass, coordinates, sun times, checklists, notes |
| Library | Packs, downloads, Share / Receive (P2P), storage, settings |

**Onboarding "Get prepared"**

1. Language and country (drives emergency numbers, default packs and map).
2. Automatic tier and free-space detection.
3. Storage budget (e.g. 2 / 8 / 32 GB) with a preset pack bundle each; editable.
4. "You are ready" indicator on the home screen: cards ✓, regional map ✓, encyclopedia ✓, AI ✓.

**Tools that work without packs**

- **SOS light:** Morse ···———··· with the flash; screen mode (white or red).
- **Compass and coordinates:** magnetometer + GNSS; "send my location by SMS" opens the SMS app, never sends automatically.
- **Sun times:** sunrise and sunset computed locally.
- **Checklists:** go-bag, home supplies, family plan; editable and linked to cards.
- **Notes:** plain text, encrypted, optionally linked to a map place.

**Accessibility:** dynamic type and touch targets ≥ 48 dp; WCAG AA contrast in both themes; TalkBack/VoiceOver labels everywhere; emergency cards read aloud with the OS TTS.

## Data model and storage

Large data are immutable files. User data live in one encrypted SQLite database. Migrations are shared by mobile and desktop (`packages/db`), numbered and forward-only.

```
<content root>/
  zim/       *.zim
  models/    *.gguf
  maps/      *.pmtiles, *.places.sqlite
  tmp/       *.partial (cleaned on every start)
<app data>/
  app.db     SQLCipher
  catalog/   catalog.json + .sig (newest valid)
  logs/      rotating
```

```sql
CREATE TABLE packs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('zim','gguf','pmtiles','places')),
  version TEXT NOT NULL, path TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL, verified INTEGER NOT NULL CHECK (verified IN (0,1)),
  catalog_seq INTEGER, license TEXT, installed_at INTEGER NOT NULL, last_opened_at INTEGER
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, title TEXT, model_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL,
  citations_json TEXT, flags INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE places (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, lat REAL NOT NULL, lon REAL NOT NULL,
  note TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE notes (
  id TEXT PRIMARY KEY, body TEXT NOT NULL, place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE bookmarks (
  pack_id TEXT NOT NULL, path TEXT NOT NULL, title TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (pack_id, path)
);
CREATE TABLE energy_samples (
  action TEXT NOT NULL, tier TEXT NOT NULL, battery_delta_pct REAL NOT NULL,
  duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

- `packs` is the source of truth for installed packs. Startup does a quick check (existence and size); full hash only on mismatch or via "Integrity check".
- `messages.citations_json` holds `{ sourceId, packId, path, section }[]` so old answers can reopen their sources; a deleted pack shows "unavailable".
- `energy_samples` feeds blackout-mode cost estimates and never leaves the device.
- Backup is an explicit export to an encrypted file (passphrase). No cloud sync.

## Testing and verification

No PR merges without a green gate: typecheck, lint, unit tests, release build and E2E. The project-specific rule: all E2E runs with the network off.

| Level | Tool | Checks |
| --- | --- | --- |
| Static | `tsc --noEmit` (strict), ESLint, `cargo clippy -D warnings`, ktlint, SwiftLint | Types, "no fetch outside ContentStore", dependency boundaries |
| Unit (core) | Vitest | RAG (fusion, chunking, char budgets, JSON output parsing, bigram support check, numeric/unit check, no-source path), catalog verification (valid/invalid signature, rollback), guards, emergency lexicon, i18n |
| Native modules | JUnit + instrumentation (Android), XCTest (iOS), `cargo test` | ZIM open/search on a small fixture, viewer sealing (schemes blocked, JS off, CSP, path traversal), streaming hash |
| AI quality | `/tools/rag-eval` with llama.cpp on CPU in CI | Golden sets (English primary, Greek secondary) incl. an adversarial set: citation precision, refusal without source, no number/unit absent from the source, tokens per character |
| E2E Android | Maestro on emulator and device | Onboarding, search, article, Layer 1 + AI answer with sources, map, card, P2P between two emulators — all in airplane mode |
| E2E iOS | Maestro on simulator | Same flows (AI only on a real device; llama.rn does not support the simulator) |
| E2E desktop | Playwright on the web UI with mocked commands; tauri-driver smoke on Windows | Main flows and "Station" mode |
| Zero-egress | Proxy logging every connection during E2E | No connection except explicit download flows to catalog hosts |
| Fuzzing | libFuzzer on ZIM, GGUF and PMTiles loaders, nightly | Crashes and OOM on malicious files |
| Performance | `/tools/bench` on reference devices (+ T1-simulation mode) | Performance targets, tokens/s, % battery per answer |
| Builds | `gradlew assembleRelease` locally and in CI, `xcodebuild`, `tauri build` | Release builds from source, no prebuilt binaries from postinstall |

**Fixtures:** a small ZIM (English + Greek articles), a tiny GGUF for CI, a one-city PMTiles, a test catalog signed with a test key that never ships in a release build.

## Build, release and distribution

App and catalog ship independently: the app uses semver, the catalog uses `sequence`. A new pack needs no store review.

| Channel | Artifact | Note |
| --- | --- | --- |
| GitHub Releases | Signed APK (arm64 + universal), MSI, DMG | SHA-256 and attestations published |
| F-Droid | Built by F-Droid | Source builds, no prebuilt binaries, no Play Services |
| Google Play | AAB with ABI splits | Data Safety "no data collected" |
| App Store / TestFlight | iOS build | Apple Developer Program (annual fee); same account notarises macOS |
| Windows | Tauri MSI/NSIS, winget | Without a code-signing certificate SmartScreen warns |

**CI (GitHub Actions):** Linux (core, lint, eval, Android build), macOS (iOS, macOS), Windows (Tauri). kiwix and llama.cpp artifacts cached by pinned version. Release keys in GitHub Environments with required approval; the catalog key never in CI. Locally, Android releases build with `gradlew assembleRelease`; EAS only as a fallback.

**Distribution note:** sideloaded APKs trigger Google Play Protect prompts on install; Play Store and F-Droid are the user-facing channels.

**Store policies (risks)**

- **Play, AI-Generated Content:** in-app reporting of problematic answers; a "Report" button prepares an issue or email for when online.
- **Play, Health:** no diagnostic claims in the listing; health apps declaration completed.
- **Android permissions:** `LocalOnlyHotspot` needs `NEARBY_WIFI_DEVICES` on Android 13+. No `REQUEST_INSTALL_PACKAGES` (shared APKs are installed via browser or file manager).
- **Apple 1.4.1 (medical):** clear warnings and sources on all medical content.
- **Apple 2.5.2 (downloaded code):** GGUF and ZIM are data; JavaScript inside ZIM stays off by default.
- **Apple Local Network:** P2P needs `NSLocalNetworkUsageDescription` and the Hotspot Configuration entitlement.
- **Size:** packs download after install; the app is useful from first launch via cards and tools.

## Licences and legal

The app is **GPL-3.0-or-later**, required because libzim is GPL-2.0-or-later and libkiwix is GPLv3.

| Component | Licence | Obligation |
| --- | --- | --- |
| libzim / libkiwix | GPL-2.0+ / GPL-3.0 | App licence and source availability |
| llama.cpp, llama.rn | MIT | Notice in About |
| MapLibre | BSD-2-Clause | Notice in About |
| Map data (OpenStreetMap) | ODbL | Visible "© OpenStreetMap contributors" on the map |
| Wikipedia, Wikivoyage, WikiMed | CC BY-SA | Attribution on each article (in the ZIM) and on AI answers that use them |
| AI models | Apache-2.0 or MIT only in the catalog | Free redistribution and P2P; models with special terms (e.g. Llama, Gemma) excluded |
| Emergency cards | CC BY-SA 4.0 (ours) | Sources only public domain or openly licensed |

**Legal risks**

- **GPL and the App Store:** a grey area; Apple's terms have been considered GPL-incompatible in the past. Kiwix ships on the App Store, but this needs review before the public iOS submission.
- **Trademarks:** no "Wikipedia", "Kiwix" or "NOMAD" in the name or icon; descriptive use only ("reads ZIM files").
- **Disclaimer:** in onboarding and About — educational content, not medical advice, no warranty (GPL §15–16).
- **Content redistribution:** mirrors are the official sources (Kiwix, Hugging Face, Protomaps). Our own mirror, if any, keeps each pack's licence and attribution.

## Roadmap

Each phase starts only after the previous gate passes. Dates are set after Phase 1 measurements.

1. **Phase 0 · Android spike — DONE, GO.** libkiwix (official Maven package) · llama.rn · PMTiles map · native viewer. Report: `docs/spike-report.md`.
   - Gate result: search, article, map and APK size passed; first-token latency failed (12–18 s vs 4 s), addressed by the two-layer answer and revised targets.
2. **Phase 1 · Android MVP (English-first).**
   - Release keystore outside the repo (first task).
   - Two-layer answers (Layer 1 extractive, Layer 2 AI) with char-based budgets, Q4_0, shorter prompt, KV-cache reuse; GPU/NPU backend experiment.
   - Citation hardening: bigram support check, numeric/unit rule, adversarial set in rag-eval, medical-intent flow.
   - Viewer sealing instrumentation tests.
   - Signed catalog and downloads; English default packs + Greek locale packs.
   - Emergency cards (English master + Greek), onboarding, blackout mode, T1-simulation mode.
   - rag-eval (English primary, Greek secondary, tokens/char) and Maestro in CI.
   - Gate: Maestro in airplane mode green · zero egress · viewer sealing tests green · rag-eval above threshold · Layer 1 < 1 s and sources < 2 s (T1-simulation) · first token < 15 s on T2 · T1 measured if a device is available.
3. **Phase 2 · iOS and P2P.** iOS from the same Expo app · Swift binding with CoreKiwix.xcframework · iOS native viewer · internal TestFlight · place search and POIs · P2P with hotspot and QR on Android and iOS · APK propagation.
   - Gate: Maestro green on iOS · verified transfer Android→iPhone · fuzzing without crashes.
4. **Phase 3 · Desktop and public release.** Tauri app for Windows and macOS with "Station" · GitHub Releases, F-Droid, Play, App Store · security review of the threat model.
   - Gate: store approvals · emergency cards reviewed by first-aid professionals · T1 targets measured on a real 4 GB device.
5. **Later.** Precomputed embeddings for curated packs · NPU on Android · more locales.

## Risks and open questions

The project hinged on the libkiwix binding and small-model quality; Phase 0 cleared the first. The second is now addressed by English-first content, two-layer answers and citation hardening.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Small models write poorly or ignore sources | AI loses value | Layer 1 extractive answers always available; JSON per-sentence output; bigram + numeric checks; rag-eval from day one |
| AI latency on low-end phones | Unusable AI on T1 | Layer 1 first; AI summary on demand on T1; Q4_0; char budgets; GPU/NPU experiment; English-first content (≈4× fewer tokens than Greek) |
| T1 targets unmeasured | Surprises on cheap phones | T1-simulation mode now; real 4 GB device before public release |
| Own viewer code replaces a library | Security regressions | Instrumentation tests as a Phase 1 gate; separate iOS implementation in Phase 2 |
| A wrong medical answer causes harm | Physical harm, reputation | Static cards, numeric rule, mandatory sources, AI summary opt-in on medical intent |
| Apple rejects the app (GPL, 1.4.1, 2.5.2) | iOS lost | Internal TestFlight in Phase 2; public submission in Phase 3 after legal review |
| Thermal throttling and battery drain | Useless in a real blackout | Guards, blackout mode, measured cost in the UI |
| Catalog key theft | Malicious content with an official signature | Offline key, backup key, rotation procedure |
| One developer maintains 4 platforms | Slow progress, burnout | Android first, then iOS, then desktop (Windows and macOS) |

**Decisions**

| Topic | Decision |
| --- | --- |
| Product language | English-first (UI default, content, docs, code). Greek is the first additional locale, shipped in v1. |
| Platform order | Android → iOS → desktop (Windows, macOS). iOS needs a Mac for debugging the Swift module. |
| Test devices | Galaxy S23 (T2) now; T1 targets pending; T1-simulation mode until a 4 GB device is available. |
| Answer model | Two layers: Layer 1 extractive (instant), Layer 2 AI summary (automatic on T2+, on demand on T1). |
| Latency targets | Layer 1 < 1 s and sources < 2 s on T1; first token < 15 s on T2; T1 first-token target set after measurement. |
| Citation checks | JSON per-sentence output; bigram support check; numbers with units must be verbatim in the source or the sentence is removed; adversarial rag-eval set. |
| Article viewer | Native viewer in expo-zim (not react-native-webview), with sealing instrumentation tests. |
| ICU | Excluded (ADR). Re-test any new locale without ICU. |
| Files from SAF | Copied into app-specific storage (fd-only breaks the Xapian index). |
| PMTiles on iOS / React Native | Supported; one `file://` test on an iPhone remains. |
| Model shortlist for rag-eval | T1: Qwen ~1.5–2B · T2: Qwen ~3–4B · T3: Qwen ~7–8B; Meltemi 7B (Apache-2.0) for the Greek set. Krikri excluded (Llama 3.1 licence). |
| Release signing | Dedicated keystore outside the repo; fingerprint published with the first public release. |
| Emergency cards | Public-domain or permitted material only; review by at least 2 certified first-aid instructors; no release without review. |
| Catalog hosting | Own domain CNAME'd to GitHub Pages, raw GitHub fallback in the app. |
| Name | Project S.K.E.P.I. (Survival Knowledge & Emergency Pocket Intelligence). |

**Open**

- [ ] Official trademark check for S.K.E.P.I. on EUIPO / TMview (GitHub and web are clear in our space).
- [ ] A Mac for iOS development: purchase or cloud Mac.
- [ ] A 4 GB Android device for T1 measurements.
