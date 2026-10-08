# Project S.K.E.P.I. — Architecture

**S.K.E.P.I.** = **S**urvival **K**nowledge & **E**mergency **P**ocket **I**ntelligence. *Skepi* (σκέπη) is Greek for shelter, protection.

> Status: Phase 0 complete (GO); Phase 1a (foundation and security hardening) complete; Phase 1b (two-layer answers, latency, citation hardening) complete — report `docs/phase-1b-report.md`; Phase 1c (retrieval parity, signed catalog, downloads, import) — report `docs/phase-1c-report.md`, threat model `docs/threat-model.md`; Phase 1d (structural injection filter, release guards, emergency cards, onboarding, blackout mode, tools) — report `docs/phase-1d-report.md`, Phase 1 gate `docs/phase-1-gate.md`; Phase 2a (P2P sharing, places and map packs, English-only gates; Android) — report `docs/phase-2a-report.md`; Phase 3a (Windows desktop app with Tauri 2 and Station mode) — report `docs/phase-3a-report.md`. This file is the source of truth for Claude Code. The two diagrams of the Claude Doc are rendered here as text.

## Vision and principles

An open-source, mobile-first app that provides Wikipedia, medical and survival knowledge, maps and an AI assistant with no connectivity after the initial download. It runs on Android, iOS, Windows and macOS using open formats, so the same content moves from device to device.

**Goals**

- The library and maps work on a 4 GB RAM phone, without AI.
- The AI answers only from sources on the device and shows them in every answer.
- Content is shared device-to-device without internet.
- Zero telemetry; no connection without an explicit user action.
- English-only until v1 (UI, content, docs, evaluation). Greek is the first post-v1 locale: its existing strings and tests stay in the code but are frozen and outside the required gates.

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
| Article viewer | Native viewer inside `expo-zim` (platform WebView driven natively) | Separate sealed WebView2 window over the `zim` custom protocol: no IPC capability, JavaScript off, CSP with `sandbox` (Phase 3a) | react-native-webview cannot serve a custom `zim://` scheme without patching on both platforms (Phase 0 finding). |
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
  /i18n              English strings; Greek kept but frozen until after v1 (developer flag); typed catalogs + locale resolution
  /emergency-cards   Curated static emergency cards (typed data + per-step sources), English master (shown); Greek translation kept, not shown until reviewed; per-country emergency numbers; release check for draft cards
  /ui-tokens         Colours, type scale, touch targets, light and blackout themes (WCAG AA checked in tests)
/modules
  /expo-zim          Kotlin + Swift binding over libkiwix/libzim, plus the native article viewer
  /expo-device-profile  RAM, thermal state, battery, free storage
  /expo-transfer     P2P (Phase 2a): TLS 1.3 server with a per-session pinned certificate, pinned client hashing every chunk, LocalOnlyHotspot + WifiNetworkSpecifier, QR encode/scan (ZXing, CameraX), local APK page
  /expo-hash         Streaming SHA-256 (whole file + 64 MiB chunks) on a native thread, progress, cancel
  /expo-content-store  The only network user: system DownloadManager, SAF import, atomic install, embedded catalog
  /expo-emergency-tools  SOS torch (Morse timeline), compass, one-shot GNSS fix (GPS provider, no Play Services), screen brightness
/crates
  /zim-ffi           Rust FFI to libzim (cxx shim over the official Windows build)
  /desktop-core      ZIM text, inference (llama.cpp), content store + downloader, signed catalog, SQLCipher db,
                     DPAPI key, places, Station mode (P2P host), viewer protocol; bin/zim-sidecar for parity
/native
  /kiwix             Pinned versions + checksums (Maven AAR, xcframework; libzim 9.7.0 Windows build + fetch script)
/tools
  /catalog-builder   Builds and signs catalog.json (keygen, pin, build, keylist, verify; key never in the repo or CI)
  /rag-eval          Answer evaluation against golden sets
  /bench             Benchmarks: tokens/s, latency, energy
  /release-guards    CI checks on the Android release build: permission allowlist (aapt2), release JS bundle rebuild probe
/docs                Architecture, ADRs, threat model, SECURITY.md, phase reports
```

**Dependency rules**

- `core` depends only on `contracts`, never on React, Expo or Tauri.
- `apps` provide the interface implementations (adapters) and inject them into core.
- Internet access exists only in ContentStore (`apps/mobile/src/lib/contentStore.ts` over `modules/expo-content-store`); local-network P2P only in `apps/mobile/src/lib/transfer.ts` over `modules/expo-transfer` (local addresses only, enforced in core and natively); ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, Node network modules and the native downloader anywhere else (tooling exception: `tools/catalog-builder/src/download.ts`). On the desktop, internet access exists only in `crates/desktop-core/src/download.rs` (ContentStore) and the LAN server only in `crates/desktop-core/src/station`; the UI reaches the native side only through `apps/desktop/src/lib/ipc.ts` (ESLint forbids `@tauri-apps/*` imports elsewhere); its only `fetch` reads PMTiles from the local `maps` protocol.
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

**Tier detection** (`packages/core`, `detectMobileTier`) uses the RAM visible to Android, which is always below the marketed size: < 3300 MB → T0, < 6500 MB → T1, otherwise T2 (T3 is desktop-only). On the desktop (`detectDesktopTier`, `resolveDesktopProfile`): T3 with a GPU of ≥ 4 GB dedicated memory (llama.cpp Vulkan device; integrated GPUs count as 0) or ≥ 15,000 MB RAM, otherwise the mobile thresholds; T3 offloads every layer to the discrete GPU (CPU fallback), context 8192. The T3 character budget applies only with a 7–9B model; with the mobile model (Qwen2.5-1.5B) the desktop keeps the T2 budget it was validated with (Phase 3a).

**Test devices.** Current reference: Galaxy S23 (8 GB, T2). All T1 gates stay **pending** until a 4 GB device is available. Until then, the app has a **T1-simulation mode** used on the S23 to catch large regressions early; a 4 GB Android emulator covers functional (not performance) checks.

- T1-simulation forces the T1 profile on any device: T1 model (Qwen2.5-1.5B **Q4_0** preferred, Q4_K_M fallback), **2 unpinned threads** (pinning to big cores would hide T1 latency), n_ctx 2048, T1 character budget, AI summary on request. It is a developer setting (Bench tab, persisted in app.db since Phase 1c) and applies to Ask and the bench.
- Normal mode applies the detected tier: T2 uses Q4_0 on the performance cores (pinned), the T2 character budget and automatic AI summaries; T1 uses on-demand summaries; T0 loads no model.
- The bench JSON (schema 3) records `mode` (`normal` | `t1-simulation`), the backend and the applied profile, and per language Layer 1 latency, sources-visible latency, TTFT, tokens/s, reused prompt tokens and the tokenizer check.

**Context budgets** (`packages/core/src/budget.ts`) are set in **characters of source text per tier and question language** and converted to tokens with the active model's measured tokens-per-character (`packages/core/src/tokens.ts`, one profile per tokenizer; unknown models get a conservative fallback). The budget is clamped so that sources + system prompt + question + answer fit n_ctx.

| Tier | English | Greek | Max passages |
| --- | --- | --- | --- |
| T1 | 1,800 chars | 650 chars | 3 |
| T2 | 2,600 chars | 1,000 chars | 4 |
| T3 | 12,000 chars | 6,000 chars | 8 |

Chunks are ~600 characters (sentence-packed, never across sections). **Answer length is set in characters per language** (`ANSWER_MAX_CHARS`: English 408 = 3 × 136, Greek 172 = 2 × 86) and converted to a token limit with the active model's tokens per character plus the JSON overhead (Qwen2.5/Qwen3: 150 / 200 tokens); the JSON schema bounds each sentence's length (`maxLength`) so the object closes within the limit.

**T2 model (Phase 1c).** Qwen3-4B-Instruct-2507 (Apache-2.0 on the model card; Q4_0 quantised by us from the official weights) was evaluated and **not adopted**: English TTFT p95 15.3 s on the S23 (> 15 s), Greek 32 s. T2 keeps Qwen2.5-1.5B Q4_0. Qwen2.5-3B is excluded (Qwen Research licence). Numbers in `docs/phase-1c-report.md`.

**Model selection.** Default family: small Qwen models. The exact model is chosen by `/tools/rag-eval` (English set; the Greek set runs only with `--greek` and is not gated until after v1), not by reputation. rag-eval also reports **tokens per character** per language: a tokenizer that is efficient for a language directly cuts latency. A new model ships only if it does not regress citation precision or refusal-when-no-source.

**Model lifecycle**

1. **Load:** lazy, on the first AI request. Free RAM is checked first (`loadLlamaModelInfo` + `DeviceProfile`); if it does not fit, a smaller model is proposed.
2. **Run:** tokens stream to the UI with a stop button. The system prompt is short, fixed and always first; llama.rn keeps the KV cache of the previous request and reuses the longest common token prefix (verified in llama.rn 0.12.9 `rn-completion.cpp`), and the app prefills the system prompt right after loading (`LlamaEngine.prewarm`). Temperature 0.2, answer length in characters (above). The Ask screen shows the load progress (llama.rn `onProgress`).
3. **Unload:** after 2 minutes idle, when the app goes to background, or on memory warning (`onTrimMemory` / `didReceiveMemoryWarning`).

**Inference settings**

- Threads = performance cores, not all cores.
- mmap on, mlock off on mobile.
- Q4_0 quantization on mobile, the default since Phase 1b (22% faster prefill than Q4_K_M on the S23 in Phase 0).
- Metal on iOS. Android: CPU by default. GPU (OpenCL, Adreno) and NPU (Hexagon) backends sit behind a developer flag (Bench → backend) and a separate experiment build (`SKEPI_GPU_EXPERIMENT=1` at prebuild); results in `docs/phase-1b-report.md`. Never enabled by default.
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

- **Title suggestions** while typing (SuggestionSearcher, `suggestTitles` in core): packs in the language of the typed text first, every pack capped (8 of 20), packs queried in parallel natively (one thread per pack, up to 4). Target p95 < 50 ms.
- **Full-text** on Enter (Searcher + Xapian) across all open archives, filterable by pack and language. Target p95 < 300 ms on T1.
- The home search queries articles, emergency cards and map place names at once.

**Sealed article reading (native viewer in expo-zim)**

- The viewer loads only from a custom scheme (`zim://<archiveId>/<path>`), served by native handlers: `shouldInterceptRequest` on Android, `WKURLSchemeHandler` on iOS.
- Every http(s), file or intent request is blocked. External links are shown as text marked "external" and never open automatically.
- JavaScript is off by default. If a pack needs it (video, maths), it is enabled per pack with a warning.
- Every response, including 403/404, carries a CSP header: `default-src 'none'; img-src zim: data:; style-src zim: 'unsafe-inline'; font-src zim:; media-src zim:`.
- The viewer is `SealedWebView` (no Expo types, so it is testable alone): `loadUrl`, `loadData`, `loadDataWithBaseURL` and `postUrl` accept only valid `zim://` URLs, `addJavascriptInterface` throws, non-zim navigations are logged and reported as external links, Safe Browsing and file/content access are off.
- Blackout theme injects dark CSS with pure-black background for OLED.
- Because this is our own code (not a library), its guarantees are covered by instrumentation tests (`modules/expo-zim/android/src/androidTest`, `SealingTest`, on a 36 KB CC0 fixture ZIM): other schemes blocked and logged, JS disabled and no JS interface, CSP present on every response, path traversal (`zim://…/../`, percent-encoded, double-encoded and backslash variants) rejected, Safe Browsing and file/content access off.

**Sealed article reading on the desktop (Phase 3a).** Articles open in a separate `viewer` window loading `http://zim.localhost/<archiveId>/<path>` (WebView2's form of the `zim` scheme; `apps/desktop/src-tauri/src/protocols.rs` over `crates/desktop-core/src/viewer.rs`). The window has no IPC capability (the ACL denies every command), JavaScript is off (`disable_javascript`), it is incognito, navigation outside the zim origin is cancelled and reported to the main window as text, new windows and downloads are denied. Every response carries `default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox` (`'self'` is the zim origin) as a header and a meta tag; the protocol answers only the viewer webview; traversal is refused as on Android. Proven on the real build by `e2e/tauri-smoke.mjs` with the same CC0 sealing fixture as `SealingTest`.

**Text for RAG**

HTML is converted to text natively (jsoup on Android, SwiftSoup on iOS, scraper in Rust — `crates/desktop-core/src/text.rs` reproduces jsoup 1.23.2 `Element.text()` and Android's ICU `\s`, so desktop retrieval matches the phone 108/108), keeping section structure (`{ heading, level, text }[]`). Infoboxes, navboxes, references and "See also" are stripped. Results are kept in a small in-memory LRU cache.

**Files on disk**

- **Android:** app-specific external storage (`getExternalFilesDir`), no permissions. SD card via the card's app-specific directory (`getExternalFilesDirs`), still a real path. Files from the Storage Access Framework are **copied** into the app, because opening a ZIM from an fd only breaks the Xapian index (libzim #852).
- **iOS:** Application Support with `isExcludedFromBackup`. Import via the Files app.
- **Desktop:** user-chosen folder, external drives supported (a USB stick becomes a portable library).

**First-release packs** (size shown in the catalog)

- English Wikipedia: small edition (top articles) and no-pictures edition. Default.
- WikiMed, Kiwix's medical encyclopedia. Default.
- Wikivoyage, for local information and travel.
- Locale packs: e.g. Greek Wikipedia (no-pictures and full). Frozen until after v1: offered only when the Greek UI developer flag is on.
- Our own "Survival" pack in ZIM format, from public-domain or openly licensed material (government manuals, civil-protection guides), built with zim-tools.

## RAG pipeline and grounding

Every answer comes in **two layers**, both built only from passages found on the device. All logic lives in `packages/core` and is identical on all platforms.

- **Layer 1 — extractive answer (instant, no LLM).** The best passages from the sources, with the sentences that match the question highlighted, each with its source id and section anchor (`buildLayer1`). Always correct, because it is verbatim source text. Shown before any model work starts; primary answer on T1 and in blackout mode. Target < 1 s on T1.
- **Layer 2 — AI summary.** Streams below Layer 1 (`summarise`). Automatic on T2+, on demand ("Summarise with AI") on T1 and in T1-simulation, on tap only for medical intent.

**Pipeline** (`retrieve` = steps 1–6 and Layer 1; `summarise` = steps 7–9)

1. **Language:** detected deterministically from the script (no model).
2. **Emergency and medical intercept:** fixed lexicons per language (English, Greek). An emergency match shows the emergency number and the card slot immediately; a medical match (doses, drugs, symptoms, diseases, treatment) shows the number and Layer 1 first and gates the AI summary behind a tap.
3. **Query rewrite (T2+ only, later phase):** the LLM with GBNF outputs `{ queries: { lang: string, terms: string[] }[], intent }`. Today every tier uses the question without stopwords.
4. **Retrieval:** in each open pack, Xapian full-text with the conjunctive query plus single-keyword queries (always, not only when the conjunctive query is short) and title suggestions for all keywords and adjacent keyword pairs; all lists merged with reciprocal rank fusion over the **rank inside each archive** (never the position in an engine's concatenated multi-archive list; Phase 1c parity fix), packs in another language than the question offset by one full list, deterministic tie-breaks; top 8 articles. Folding maps the Greek final ς to σ for matching; queries restore ς because the ZIM index keeps it (Phase 1b fix: Greek single-word questions found nothing).
5. **Passage selection:** sections are first cleaned of injected text (`sanitizeSourceText`: the Phase 1d **structural filter** — forged `<source>` blocks/tags, chat-template markup, JSON objects with role/system/assistant keys, role-prefixed lines, sentences addressed to the model/assistant/AI/summariser, each with the rest of its paragraph — plus the Phase 1b lexicon; section text keeps one line per block element so paragraphs bound the removal), then cut into ~600-character chunks and ranked with BM25 plus a title bonus (the share of the article title's terms that the question contains), which keeps "What is DNA?" on the DNA article when every candidate mentions DNA. On T2+, optional rerank with a small multilingual embedding model (later).
6. **Context budget, in characters** per tier and language, converted with the active model's tokens-per-character (table above). Every passage must pass the no-source bar and contain the question's numbers; when the question names an article (full title match), passages come from that article. Otherwise preference for diversity across articles. Articles are ordered by their best passage; **passages of one article keep reading order** (lead first) — rag-eval coverage en 60 → 72%, el 40 → 47% (Phase 1c).
7. **No source:** if the best chunk covers < 60% of the query terms or scores < 0.5, show "No relevant source found". No Layer 1 passages, no generation. Calibrated with rag-eval.
8. **Prompt and output format:** a short fixed system prompt (`rag-v5-json-short`, KV-cache prefix; asks for `covered: false` on personal and future questions), passages wrapped in `<source id="S1" title="…">…</source>` with tag characters neutralised, then a one-line language instruction and the question. The model must answer in grammar-constrained JSON `{covered, sentences[1..n]{text ≤ maxLength, source ∈ ids}}`. Source text is data, not instructions.
9. **Post-validation (per sentence, as soon as each sentence object is complete while streaming):**
   - Citation ids that do not exist are dropped.
   - Numbers with a unit (mg, ml, °C, minutes, hours, tablets, %, kg… in English and Greek) must appear verbatim (same number, same unit) in the cited source; bare numbers must appear as whole numbers. Otherwise the sentence is **removed**.
   - Relevance: the sentence must share at least one content term with the question.
   - Support: content **bigrams** of the sentence must be found as term pairs within one source sentence (title terms pair with everything), at a calibrated threshold (`MIN_BIGRAM_SUPPORT`), and the sentence's terms must form one connected graph over those pairs (coherence: no stitching of facts from different sentences).
   - An answer left with no supported sentence is hidden; Layer 1 stays.
10. **Display:** every AI answer carries the fixed label "AI summary — check the source" ("Unverified AI summary — check the source" on medical intent). Each sentence carries a tappable `[S1]` chip that opens the article at the section. If source and answer languages differ, the chip says so and offers the original text (later).

**Medical intent:** the emergency number, the matching curated cards (intercept topics + card keywords) and Layer 1 are shown, in that order (Phase 1d). The AI summary is available only by tap and is labelled "Unverified AI summary — check the source".

**Why not a vector index of all of Wikipedia:** embeddings for millions of chunks would take many GB and hours on a phone. Xapian is already in the ZIM and covers recall. Embeddings are only for reranking a few dozen chunks. Small curated packs (Survival, WikiMed) may ship precomputed embeddings later.

**Prompt injection:** the model has no tools that act, so a malicious article can at most affect the text of one answer, which the user can see through the citation. That is why "answers only with sources" is also a security measure.

## Offline maps

Maps are vector tiles in one PMTiles file per region, rendered by MapLibre directly from disk, with no tile server or network request. MapLibre Native supports local `pmtiles://file://` on Android from 11.7.0 and on iOS from 6.10.0; maplibre-react-native currently wraps Android 13.2.0 / iOS 6.26.0. Validated offline on Android in Phase 0 (render 327 ms with Greek labels); iOS still needs one test with a local file on a real iPhone.

| Component | Implementation |
| --- | --- |
| Map data | Protomaps basemap (OpenStreetMap), cut per region with `pmtiles extract` from a pinned daily build in the catalog-builder (`pmtiles-extract` source; daily builds expire, so the extract is kept and mirrored by the project). First pack: Greece (`map-gr`, build 20261005, Geofabrik boundary, z0–15, 507 MB). Only a verified pack renders. |
| Style, fonts, sprites | Bundled. Fonts cover Latin, Greek and the scripts of shipped locales. Style rewritten at runtime with absolute file paths. |
| Place search | SQLite FTS5 per region (`places-gr`: 37k places, 5.3 MB) from a dated Geofabrik extract (`osm-places` source: pyosmium → `@skepi/core` `classifyOsm` → folded names of name, name:en, name:<locale>, plus an English kind word), opened read-only. Home search queries articles, cards and places together; results show the English name with the local name. |
| Emergency POIs | Hospitals, pharmacies, fire stations, police, drinking water, shelters (incl. emergency assembly points and mountain huts) from the same places pack, as a GeoJSON layer with per-category filters (zoom ≥ 10, visible area only). ODbL attribution in the pack and on the map. |
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

- Ed25519 signature in a separate `catalog.json.sig` (base64 of the 64-byte signature), over the exact bytes (not re-serialised JSON); `@noble/ed25519` 3.2 in `packages/core/src/catalog.ts` (`verifyCatalog`, `verifyKeyList`). Each pack also names its `file` on disk.
- Two public keys pinned in the app: one active, one offline backup. A new key is accepted only via a key list signed by the old key.
- `sequence` always increases. The app rejects a catalog with a lower `sequence` than the one it holds (anti-rollback). No reliance on wall-clock time offline.
- The build ships an embedded catalog, so a phone that never touched the internet can verify packs received via P2P.
- Hashes are computed by `/tools/catalog-builder` after downloading from the official source. The private signing key never enters CI.
- Hosting: our own domain CNAME'd to GitHub Pages, with a raw GitHub fallback in the app (later phase; Phase 1c ships the embedded catalog and a catalog-update path tested against the local mirror). Map and places packs are built by the catalog-builder and mirrored as GitHub release assets (`packs-2026-10`).
- Embedded per build type: debug = test catalog + test keys (`catalog/embedded/debug`, `catalog/keys/test.json`); release = real-key catalog + release keys. A release build fails unless the embedded catalog verifies with the release keys (`skepiCheckReleaseCatalog`).
- The newest accepted catalog is kept in internal storage and re-verified on every start; the highest accepted `sequence` lives in app.db.

**Downloads**

- **Android:** system `DownloadManager` (resumes after interruption and reboot, honours Wi-Fi-only; avoids dataSync foreground-service limits). It applies the app's network security config (HTTPS only, system CAs; debug builds also trust the local test mirror CA for `127.0.0.1`), and the request carries `User-Agent: SKEPI` (its default names the device model). Active downloads are recorded in app.db and resumed after an app restart.
- **iOS:** background `URLSession`.
- **Desktop:** Rust downloader (`crates/desktop-core/src/download.rs`, reqwest + rustls, Windows certificate store): `tmp/<file>.partial` with HTTP Range resume from the verified chunk prefix, every 64 MiB chunk checked against the catalog as it arrives (a bad chunk ends that mirror), whole-file hash, atomic rename; downloads are requested by pack id and Rust re-verifies the signed catalog itself.
- Wi-Fi only by default; on metered networks show size and ask.
- Free-space check: size + 10% + 1 GB always kept free for the OS.

**Atomic install**

1. Download to `<id>.partial`.
2. Streaming SHA-256 on a native thread, with progress.
3. On match: rename and register in SQLite in one transaction.
4. On mismatch: delete and try the next mirror. No unverified file is ever opened by libzim or llama.cpp.
5. Updates download beside the old version; the old one is deleted only after the swap. If space is short, the user explicitly chooses "delete the old one first".

**File import:** files from USB, Kiwix or Files are copied into app storage, hashed and looked up in the catalog. Match = "verified". Otherwise "unverified": opens only by explicit choice, with a permanent label ("Unverified content — not in the signed catalog" in search, article and Ask sources) and JavaScript always off. Unverified GGUF files are not accepted on mobile in v1 (import rejected; provisioned ones are never loaded; app.db forbids unverified non-ZIM packs).

**Startup:** registered packs get a quick check (exists, size); files the database does not know (e.g. pushed by `scripts/provision.ps1`, which stays a dev tool) are hashed once and registered as verified when the catalog knows them, as unverified ZIM otherwise; stale `tmp/*.partial` files are removed.

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

**Desktop Station mode (Phase 3a, Windows).** `crates/desktop-core/src/station`: the same protocol and rules as `modules/expo-transfer` (QR `{ v, host, port, token, certSha256 }`, per-session EC P-256 certificate from rcgen pinned by `certSha256`, 128-bit token, TLS 1.3 only via rustls, `GET /manifest` and `GET /pack/:id` with Range, the host's signed catalog in the manifest for propagation), for up to 32 concurrent connections (many phones). The UI builds the manifest with `@skepi/core` `buildManifest`; Rust checks it against app.db and the accepted catalog and maps the selected pack ids to files itself. It binds only the chosen local IPv4 address, stops on demand or after 30 minutes idle, and can serve a user-chosen release APK on a cleartext install page (`/`, `/skepi.apk`) showing its signing-certificate SHA-256 against the published release key. Windows Firewall asks the first time; the Station screen explains to allow private networks only.

**App propagation (Android only):** the host serves its own APK with the signing-certificate fingerprint; a phone without the app opens `http://<host>:<port>/` in any browser. iOS does not allow sideloading.

**Implementation (Phase 2a, Android).**

- `packages/core/src/transfer.ts` (unit-tested, no sockets): QR payload (`parsePairing` refuses non-local addresses, tokens other than 128-bit hex, pins other than SHA-256), manifest (exactly the selected packs; never unverified non-ZIM files), host-catalog decision (`evaluateHostCatalog`: adopt only with a valid signature and a higher sequence), offer classification (`classifyOffers`: the receiver's catalog decides; host claims are never trusted), the chunk loop (`receiveChunks`: up to 3 attempts per chunk, `tampered` / `interrupted` outcomes) and the resume point (`verifiedPrefix` of the partial file's chunk hashes).
- `modules/expo-transfer` (Kotlin): `SessionCert` (fresh EC P-256 key, minimal DER self-signed certificate per session), `TransferServer` (TLS 1.3 only, token, `GET /manifest`, `GET /pack/<id>` with Range, 4 connections, 30 s timeouts, 30 min idle stop), `TransferClient` (pinning trust manager, local addresses only, chunk written at its offset and hashed while writing), `LocalNetwork` (LAN address, LocalOnlyHotspot, WifiNetworkSpecifier join, socket factory of the matching network), `ApkServer` (cleartext `/` and `/skepi.apk` only), `Qr` + `QrScannerView` (ZXing core, CameraX). Debug builds only: corrupt/drop/tamper faults and the pairing file for the two-emulator E2E.
- App: Library → "Share packs nearby" / "Receive packs nearby". Partial files live in `tmp/<file>.p2p.partial` and survive restarts for resuming; installs go through ContentStore (`installReceived`: whole-file hash, atomic rename, `packs.source = 'p2p'`, migration 3).
- Permissions: INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE (LAN); CHANGE_WIFI_STATE plus NEARBY_WIFI_DEVICES (`neverForLocation`, Android 13+) or ACCESS_FINE_LOCATION (Android 8–12) for LocalOnlyHotspot; CHANGE_NETWORK_STATE for WifiNetworkSpecifier (Android 10+; older receivers join the hotspot in Wi-Fi settings); CAMERA for the QR code only, asked on the Receive screen. No REQUEST_INSTALL_PACKAGES, no foreground service (the Share/Receive screens keep the screen awake).

## Security

The biggest risk is a malicious file (ZIM, GGUF, PMTiles) reaching a C++ parser. The central defence: nothing opens without a signed hash. The threat model lives in `/docs/threat-model.md` and is updated with every feature.

**What we protect:** device integrity, content integrity (a wrong medical instruction = physical harm), and user data (questions, notes, map places).

| Threat | Mitigation |
| --- | --- |
| Malicious ZIM, GGUF or PMTiles (parser exploit) | Opens only if the hash matches the signed catalog. Unverified files only by explicit choice (GGUF never on mobile). llama.cpp and libzim pinned and updated via Renovate; first fuzzing targets. |
| Tampered content via mirror, MITM or P2P | Ed25519 catalog with pinned keys, SHA-256 per file and chunk, `sequence` anti-rollback |
| Theft of the catalog signing key | Key kept offline (hardware key or offline machine), never in CI; backup key and rotation procedure |
| XSS or data leak from article HTML | Native viewer: `zim://` only, JS off, strict CSP, no JS bridge, no file:// or network; covered by instrumentation tests |
| Prompt injection via articles | No LLM tools; the structural filter (forged source markup, chat markup, JSON role objects, role prefixes, sentences addressed to the model) and the injection lexicon remove text before chunking, so neither Layer 1 nor the model sees it; answers always with checked citations; emergency cards never pass through the LLM |
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
- **Release signing:** the Expo `debug.keystore` used in Phase 0 is for development only. Release builds use a dedicated keystore kept outside the repo, read via `~/.gradle/gradle.properties` (`SKEPI_RELEASE_STORE_FILE`, `SKEPI_RELEASE_STORE_PASSWORD`, `SKEPI_RELEASE_KEY_ALIAS`, `SKEPI_RELEASE_KEY_PASSWORD`), generated once by the maintainer with `keytool`, backed up with its password in a password manager. Wired by the config plugin `apps/mobile/plugins/withReleaseSigning.js` (never by editing generated Gradle files). A release build without these properties **fails**; the only escape hatch is `-PskepiDebugSign=true` for local E2E, with a loud warning. Procedure and fingerprint: `docs/release-signing.md`.

## Privacy

Nothing leaves the device: no account, backend, analytics or third-party crash reporting. The only egress is content downloads started by the user.

- **Download requests:** only the file URL, no device identifier, generic User-Agent, no query strings.
- **Errors:** local rotating log (~1 MB); the user exports it manually after seeing its content. Never contains query text or coordinates.
- **Location:** no location history; only places the user saves explicitly.
- **AI history:** "save conversations" toggle (on by default) and one-tap delete all.
- **Permissions:** minimal. Release allowlist (CI, `tools/release-guards`): INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, and for P2P (Phase 2a) CHANGE_WIFI_STATE, CHANGE_NETWORK_STATE, NEARBY_WIFI_DEVICES (`neverForLocation`) and CAMERA (pairing QR only); never background location, REQUEST_INSTALL_PACKAGES or RECORD_AUDIO. The torch needs no permission (`CameraManager.setTorchMode`); SMS and calls are hand-offs (`sms:`, `tel:`), never sent by the app. No contacts or photos.
- **Store forms:** "no data collected" on Play Data Safety and Apple Privacy Nutrition Label; true only while the zero-egress test passes.

## Performance, energy and blackout mode

Targets are measured on a T1 reference device (4 GB Android). A PR that regresses a target by more than 10% does not merge. Until a T1 device is available, T1 targets are **pending** and tracked on the S23 (T2) plus T1-simulation mode.

| Metric | Target | Phase 0 result (S23, T2) | Phase 1a (S23: normal / T1-simulation) | Phase 1b (S23: normal / T1-simulation, English content) | Phase 1c (S23: normal / T1-simulation) |
| --- | --- | --- | --- | --- | --- |
| Cold start to search, no model | < 2 s (T1) | not measured | not measured | not measured | not measured |
| Title suggestions, p95 | < 50 ms (T1) | 9–15 ms ✓ | 14.7 / 15.7 ms ✓ | 61.2 ✗ / 35.4 ms ✓ (3 packs) | 19 / **30 ms** ✓ (3 packs, parallel) |
| Full-text search, p95 | < 300 ms (T1) | 8–19 ms ✓ (103k and 384k articles) | 7.5 / 9.1 ms ✓ | 21.2 / 18.0 ms ✓ | 16 / 40 ms ✓ |
| Article open | < 500 ms (T1) | 321 ms ✓ | 151–383 ms in E2E ✓ | HTML p95 8.3 / 7.2 ms ✓ | HTML p95 12 / 7 ms ✓ |
| Map render | — | 327 ms ✓ | 258 ms | E2E ✓ | E2E ✓ |
| Layer 1 (extractive) answer | < 1 s (T1) | new in Phase 1 | — | p95 337 / **252 ms** ✓ (el 169 / 147) | p95 326 / **234 ms** ✓ (el 200 / 154) |
| Sources visible | < 2 s (T1) | new in Phase 1 | — | p95 217 / **198 ms** ✓ (el 198 / 164) | p95 285 / **175 ms** ✓ (el 215 / 179) |
| First AI token | < 15 s (T2); T1 set after measurement | 12–18 s ✗ (old gate 4 s, Greek, Q4_K_M) | 14.7–16.0 s (borderline) / 16.9 s | p95 **4.8 s** ✓ / 7.1 s (el 12.4 / 14.3 s) | p95 **4.5 s** ✓ / 7.1 s (el 9.6 / 12.6 s) |
| Model load | < 10 s (T1) | not reported | 1.9 / 0.8 s ✓ | 13.4 s cold ✗ / 1.3 s ✓ | warm 0.6 / 0.8 s ✓ · cold 14.0 s (target applies to warm loads) |
| APK per ABI (arm64) | < 80 MB | 55.3 MB ✓ (from 146.5 MB) | 45.9 MB ✓ (R8; dex 15.1 → 6.6 MB) | 46.0 MB ✓ | 49.4 MB ✓ (op-sqlite/SQLCipher, catalog) |

**Memory**

- On T1 the model and the map are never resident together: opening the map unloads the model.
- libzim cluster cache is capped per tier.
- One article viewer per screen, not one per tab.

**App size:** ICU data is excluded (ADR: identical results for English and Greek with and without it; saves 32 MB). Any new locale must be re-tested without ICU before shipping. Only 3 of 7 llama.rn library variants ship; native libraries are compressed. Release builds run R8 (minify, no resource shrinking) with keep rules for `org.kiwix.**`, `com.rnllama.**`, MapLibre and the Expo modules (`apps/mobile/plugins/proguard-rules.skepi.pro`). App Bundle with ABI splits, arm64 primary.

**Blackout mode**

One tap from the home screen (switch, persisted in app.db); suggested when the battery is below 30% and not charging (checked only while the home screen is in front, never in blackout mode).

- Pure-black theme (OLED, `packages/ui-tokens` `BLACKOUT`), no animations (navigation transitions off, no spinners), dark CSS injected into article HTML by the sealed viewer.
- AI off by default: no automatic summary, the model is unloaded on entry; "Summarise with AI" on request. Layer 1 answers remain.
- GPS and compass on tap only; no periodic work at all in blackout mode.
- A power-saving tips card (airplane mode, brightness, OS battery saver, close apps).
- Costly buttons (AI summary, GPS fix, SOS torch per minute) show the median of the last measured costs on this device ("≈ 1% battery") once three samples exist. Samples (`energy_samples`) come from the battery charge counter (µAh) or the 1% level steps between the start and the end of the action; nothing is recorded while charging. Reference values are measured unplugged over wireless adb (`e2e/adb-wireless.ps1`, `e2e/run-energy.ps1`; Bench → clear/export samples).

**Desktop:** the "station" powered by a UPS or portable power station, with an AI power cap (threads, GPU layers) and a "library and distribution only" mode.

## User safety (medical and survival content)

In an emergency, first-aid instructions are never generated by the LLM. A 1–4B model will invent doses and steps. Critical content is static, sourced and human-reviewed; the AI only points to it.

**Emergency cards (`packages/emergency-cards`)**

- Initial topics: CPR, bleeding, choking, burns, fractures, hypothermia, heatstroke, poisoning, water purification, earthquake, fire, flood.
- Each card: numbered steps, "when to call for help", public-domain or openly licensed source, review date.
- Written in English; shown in English only until reviewed (the Greek translation stays in the data and its tests; translations ship after v1). Every change needs review by people with first-aid training (CODEOWNERS on the folder) — the only folder with a mandatory external reviewer.
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

1. Language (phone language or English; Greek only with the developer flag until after v1) and country (drives emergency numbers; default from the OS region, never the network).
2. Automatic tier and free-space detection.
3. Storage budget 2 / 8 / 32 GB → preset (`planPreset` in core): English defaults, the default model when the tier runs AI, then the locale's own packs (the largest that fits); capped by free space minus the OS reserve. Downloads go through ContentStore; installed packs are kept. Debug builds with the test catalog plan only test packs (local mirror).
4. Disclaimer (educational content, not medical advice, no warranty) before the app opens.
5. "You are ready" indicator on the home screen: cards ✓ (draft), regional map ✓, encyclopedia ✓, AI ✓ (or "not on this device" on T0). "Get prepared" can be run again from the Library.

**Tools that work without packs**

- **SOS light:** Morse ···———··· (unit 250 ms, `SOS_TIMELINE` in core) with the torch via `CameraManager.setTorchMode` on a native thread; screen mode (white or red, full brightness, same timeline). The screen stays on while it runs.
- **Compass and coordinates:** rotation-vector (or accelerometer + magnetometer) heading, declination from the on-device World Magnetic Model; one GNSS fix per tap from the GPS provider (works in airplane mode; no Play Services). Decimal and DMS coordinates; "send my location by SMS" opens the SMS app with the text and an OpenStreetMap link filled in, never sends automatically.
- **Sun times:** sunrise and sunset computed locally.
- **Checklists:** go-bag, home supplies, family plan; editable and linked to cards.
- **Notes:** plain text, encrypted, optionally linked to a map place.

**Accessibility:** dynamic type (no fixed text heights; system font scale honoured) and touch targets ≥ 48 dp (`MIN_TOUCH_DP`); WCAG AA contrast in both themes (every text/background pair in `packages/ui-tokens` is tested); TalkBack/VoiceOver labels and roles on buttons, links, radios, headers and alerts; emergency cards read aloud with the OS TTS (expo-speech).

**Language:** every UI string lives in `packages/i18n` (English master; Greek kept complete and tested; a missing key is a type error). English-only until v1: the UI is English unless the developer flag "Greek UI (frozen locale)" (Bench, `dev.greekUi`, off in every build) is on; then a Greek device language or a Greek choice gives Greek. `localeConfig` lists `en` only.

## Data model and storage

Large data are immutable files. User data live in one encrypted SQLite database (op-sqlite + SQLCipher; 256-bit random key per install, stored with expo-secure-store under an Android Keystore key). Migrations are shared by mobile and desktop (`packages/db`), numbered and forward-only; a database from a newer app or an edited migration is refused. Phase 1c ships migration 1 (`packs`, `settings`), Phase 1d migration 2 (`energy_samples`; typed settings for onboarding, disclaimer, UI language, country, storage budget and blackout mode), Phase 2a migration 3 (`packs.source` gains `p2p`; the table is rebuilt with the same rules; developer setting `dev.greekUi`); the other tables below arrive with their features. On the desktop (Phase 3a) app.db is rusqlite with SQLCipher (vendored OpenSSL); the random key is protected with Windows DPAPI for the current user and only the blob is stored (`db.key`); the same migrations are embedded from `packages/db/migrations.json` (a test keeps it equal to `MIGRATIONS`) with the same ledger rules.

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
  version TEXT NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL UNIQUE, size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL, verified INTEGER NOT NULL CHECK (verified IN (0,1)),
  catalog_seq INTEGER, license TEXT, source TEXT NOT NULL CHECK (source IN ('download','import','provisioned','p2p')),
  consent_at INTEGER, installed_at INTEGER NOT NULL, last_opened_at INTEGER,
  CHECK (verified = 1 OR kind = 'zim'), CHECK (verified = 1 OR catalog_seq IS NULL)
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
| AI quality | `/tools/rag-eval` with llama.cpp on CPU in CI | Golden sets (English gated; Greek items only with `--greek`, reported and never gated until after v1) incl. an adversarial set: citation precision, refusal without source, no number/unit absent from the source, summary coverage floors per language, tokens per character; a held-out adversarial set reported separately and never used for tuning |
| Retrieval parity | `e2e/run-parity.ps1` (phone) + `tools/rag-eval` parity | The English questions (Greek with `-IncludeGreek`) through retrieval only on the device and in rag-eval: identical search lists, fused hits, article text hashes, ranked chunks and sources |
| E2E Android | Maestro on emulator and device | Onboarding, search, article, Layer 1 + AI answer with sources, map, places/POIs, card — in airplane mode; P2P between two emulators on one virtual Wi-Fi (`e2e/run-p2p.ps1`, `-wifi-server-port`/`-wifi-client-port`) with faults (corrupted chunk, drop + resume, tampering host, bad-signature and older catalogs) |
| E2E iOS | Maestro on simulator | Same flows (AI only on a real device; llama.rn does not support the simulator) |
| E2E desktop | Playwright on the web UI with mocked commands (`apps/desktop/e2e/desktop.spec.ts`); tauri-driver smoke on the real Windows build (`e2e/tauri-smoke.mjs`); Station E2E desktop → phone (`e2e/run-station.ps1`) | Main flows, viewer sealing in the real WebView2 (scripts off, IPC denied, CSP, external links as text), AI on the GPU, map, zero egress (app process + webview net log), "Station" mode |
| Rust (desktop) | `cargo fmt`, `cargo clippy -D warnings`, `cargo test` (`crates/*`, `apps/desktop/src-tauri`) | Catalog parity with TypeScript (`catalog/verification-expectations.json`), Station over pinned TLS 1.3, mirror downloads, SQLCipher + migrations, DPAPI, text extraction, viewer protocol; inference on the tiny GGUF (`--ignored`, needs the model) |
| Zero-egress | `dumpsys netstats` per app UID + ContentStore request log + local mirror log | Offline flows: zero requests and zero bytes on any real interface. Download flow (local HTTPS mirror via `adb reverse`): requests only to the mirror, generic User-Agent, no query strings, zero bytes on real interfaces |
| Fuzzing | libFuzzer on ZIM, GGUF and PMTiles loaders, nightly | Crashes and OOM on malicious files |
| Performance | `/tools/bench` on reference devices (+ T1-simulation mode) | Performance targets, tokens/s, % battery per answer |
| Builds | `gradlew assembleRelease` locally and in CI, `xcodebuild`, `tauri build` | Release builds from source, no prebuilt binaries from postinstall |

**Fixtures:** small ZIMs (English; Greek kept for the frozen locale), `e2e/fixtures/p2p-propagation.zim` (known only to the newer test catalog), an OSM-candidates NDJSON for the places builder, a tiny GGUF for CI, a test catalog signed with a test key that never ships in a release build.

## Build, release and distribution

App and catalog ship independently: the app uses semver, the catalog uses `sequence`. A new pack needs no store review.

| Channel | Artifact | Note |
| --- | --- | --- |
| GitHub Releases | Signed APK (arm64 + universal), MSI, DMG | SHA-256 and attestations published |
| F-Droid | Built by F-Droid | Source builds, no prebuilt binaries, no Play Services |
| Google Play | AAB with ABI splits | Data Safety "no data collected" |
| App Store / TestFlight | iOS build | Apple Developer Program (annual fee); same account notarises macOS |
| Windows | Tauri MSI/NSIS, winget | Without a code-signing certificate SmartScreen warns |

**CI (GitHub Actions):** `.github/workflows/ci.yml` on Linux runs typecheck, lint, unit tests, the rag-eval smoke subset (fixture ZIMs + cached Qwen2.5-0.5B Q4_0) and, since Phase 1d, `android-release-guards`: expo prebuild, the draft-cards gate must fail, `assembleRelease` (debug-signed in CI, draft cards allowed for this check only), the release permission allowlist (`aapt2 dump permissions`) and the release JS bundle rebuild probe (`tools/release-guards`); since Phase 3a `desktop-windows` (libzim fetched and SHA-256 checked, UI build, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` without Vulkan, mirror download test); planned: macOS (iOS, macOS). The desktop builds locally with `scripts/with-msvc.ps1` (MSVC environment; uses Microsoft's Windows SDK NuGet packages, portable Strawberry Perl and Ninja when no SDK is installed) and `npx tauri build` (unsigned MSI + NSIS). kiwix and llama.cpp artifacts cached by pinned version. Release keys in GitHub Environments with required approval; the catalog key never in CI. Locally, Android releases build with `gradlew assembleRelease`; EAS only as a fallback. Debug builds install side-by-side as `org.skepi.app.dev` ("SKEPI Dev", debug key); release keeps `org.skepi.app`. `scripts/provision.ps1` and `e2e/run-e2e.ps1` take `-AppId` (release by default).

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
   - **Phase 1b · two-layer answers, latency, citation hardening — DONE.** Layer 1 extractive answers · labelled AI summary (auto on T2, on demand on T1, on tap for medical intent) · char budgets with measured tokens/char · Q4_0 · prompt v5 + KV prefix reuse · bigram/coherence/relevance/number-unit validation · source sanitizer · `tools/rag-eval` (en 108, el 50, adversarial 30) all thresholds met · CI smoke · GPU/NPU experiment (not usable). Report: `docs/phase-1b-report.md`.
   - **Phase 1c · 1b follow-ups, signed catalog and downloads — see `docs/phase-1c-report.md`.** Device/eval retrieval parity (158/158) · fusion and passage-order fixes · coverage floors · held-out adversarial set · char-based answer limits · parallel title suggestions · model load progress · T2 4B evaluated (not adopted) · signed catalog (core verification, catalog-builder, rotation) · `packages/db` (SQLCipher) · `expo-hash` · ContentStore (DownloadManager, import, Library) · zero-egress E2E against a local HTTPS mirror · threat model.
   - **Phase 1a · foundation and security hardening — DONE.** Release keystore and fail-closed signing · viewer sealing instrumentation tests · `modules/expo-device-profile` · `packages/i18n` (English default, Greek) · T1-simulation mode · R8 · still no INTERNET permission (downloads arrive in Phase 1c). Report: `docs/phase1a/README.md`.
2. **Phase 1 · Android MVP (English-first).**
   - Release keystore outside the repo (first task).
   - ~~Two-layer answers with char-based budgets, Q4_0, shorter prompt, KV-cache reuse; GPU/NPU backend experiment~~ (1b).
   - ~~Citation hardening: bigram support check, numeric/unit rule, adversarial set in rag-eval, medical-intent flow~~ (1b).
   - Viewer sealing instrumentation tests.
   - ~~Signed catalog and downloads; English default packs + Greek locale packs~~ (1c; public hosting later).
   - **Phase 1d · safety fixes, emergency cards, onboarding, blackout mode — see `docs/phase-1d-report.md`.** Structural source filter before Layer 1 and Layer 2 (no new lexicon phrases; fresh held-out set before public release) · release permission allowlist and bundle-rebuild probe in CI · 12 draft emergency cards from public-domain sources (release fails with drafts unless `-PskepiAllowDraftCards=true`) · per-country numbers · onboarding with storage presets · blackout mode with measured costs · Tools tab (SOS torch/screen, compass, GNSS, SMS hand-off) · accessibility pass. Phase 1 gate: `docs/phase-1-gate.md`.
   - ~~Emergency cards (English master + Greek), onboarding, blackout mode~~ (1d; cards are drafts until reviewed); ~~T1-simulation mode~~ (1a).
   - ~~rag-eval (English primary, Greek secondary, tokens/char)~~ (1b, CI smoke subset); Maestro in CI.
   - Gate: Maestro in airplane mode green · zero egress · viewer sealing tests green · rag-eval above threshold · Layer 1 < 1 s and sources < 2 s (T1-simulation) · first token < 15 s on T2 · T1 measured if a device is available.
3. **Phase 2 · iOS and P2P.**
   - **Phase 2a · P2P sharing and places (Android) — see `docs/phase-2a-report.md`.** English-only gates (Greek frozen behind a developer flag) · `modules/expo-transfer` (LAN + LocalOnlyHotspot, QR pairing, pinned TLS 1.3, per-chunk verification, resume, catalog propagation, APK page) · places pack (OSM → SQLite FTS5) and Greece map pack in the catalog · home search over articles, cards and places · emergency POI layer · release allowlist for the P2P permissions · wireless adb for unplugged battery costs.
   - **Phase 2b · iOS** (needs a Mac): iOS from the same Expo app · Swift binding with CoreKiwix.xcframework · iOS native viewer · internal TestFlight · P2P receiver on iOS.
   - Gate: Maestro green on iOS · verified transfer Android→iPhone · fuzzing without crashes.
4. **Phase 3 · Desktop and public release.** Tauri app for Windows and macOS with "Station" · GitHub Releases, F-Droid, Play, App Store · security review of the threat model.
   - **Phase 3a · Windows desktop with Station mode — see `docs/phase-3a-report.md`.** Persistent build cache · deterministic GNSS in E2E (debug-only mock provider) · `apps/desktop` (Tauri 2, React over `@skepi/core`) · `crates/zim-ffi` (libzim 9.7.0, same as Android) · llama.cpp in-process with Vulkan · sealed viewer window · MapLibre GL JS over the `maps` protocol · SQLCipher + DPAPI · Rust ContentStore · Station mode · desktop retrieval parity 108/108 with the S23 · unsigned MSI/NSIS.
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
| Product language | English-only until v1 (UI, content, docs, code, required gates). Greek is frozen as the first post-v1 locale; the architecture stays locale-ready (i18n package, per-language budgets and lexicons). Emergency cards are English-only until reviewed. |
| Platform order | Android → iOS → desktop (Windows, macOS). iOS needs a Mac for debugging the Swift module. |
| Test devices | Galaxy S23 (T2) now; T1 targets pending; T1-simulation mode until a 4 GB device is available. |
| Answer model | Two layers: Layer 1 extractive (instant), Layer 2 AI summary (automatic on T2+, on demand on T1). |
| Latency targets | Layer 1 < 1 s and sources < 2 s on T1; first token < 15 s on T2; T1 first-token target set after measurement. |
| Citation checks | JSON per-sentence output; bigram support check; numbers with units must be verbatim in the source or the sentence is removed; adversarial rag-eval set. |
| Article viewer | Native viewer in expo-zim (not react-native-webview), with sealing instrumentation tests. |
| ICU | Excluded (ADR). Re-test any new locale without ICU. |
| Files from SAF | Copied into app-specific storage (fd-only breaks the Xapian index). |
| PMTiles on iOS / React Native | Supported; one `file://` test on an iPhone remains. |
| Model shortlist for rag-eval | T1: Qwen ~1.5–2B · T2: Qwen ~3–4B · T3: Qwen ~7–8B; Meltemi 7B (Apache-2.0) for the Greek set after v1. Krikri excluded (Llama 3.1 licence). |
| Release signing | Dedicated keystore outside the repo; fingerprint published with the first public release. |
| Emergency cards | Public-domain or permitted material only; review by at least 2 certified first-aid instructors; no release without review. |
| Catalog hosting | Own domain CNAME'd to GitHub Pages, raw GitHub fallback in the app. |
| Name | Project S.K.E.P.I. (Survival Knowledge & Emergency Pocket Intelligence). |

**Open**

- [ ] Official trademark check for S.K.E.P.I. on EUIPO / TMview (GitHub and web are clear in our space).
- [ ] A Mac for iOS development: purchase or cloud Mac.
- [ ] A 4 GB Android device for T1 measurements.
