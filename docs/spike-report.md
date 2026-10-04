# Phase 0 · Spike report (Android)

Date: 2026-10-04 · Evidence: [`docs/spike/`](spike/) (bench JSON, E2E screenshots, Maestro JUnit report)

## Decision

| Item | Gate | Result | Go / No-go |
| --- | --- | --- | --- |
| libkiwix/libzim binding in an Expo module | Works | Official AAR `org.kiwix:libkiwix:2.6.0`, ~780 lines of Kotlin | **GO** |
| Suggestions p95 | < 50 ms | 13.2 ms (top, 103k articles) · 9.1 ms (all, 384k) | **GO** |
| Full-text p95 | < 300 ms | 7.8 ms (top) · 18.8 ms (all) | **GO** |
| Article open | < 500 ms | HTML p95 12.5 ms · full render in the WebView 321 ms | **GO** |
| Answer with ≥ 1 valid source that opens the right article | Yes | Yes (E2E: `[S1] Πάτρα` → article "Πάτρα") | **GO** |
| Unrelated question → "no source found" without generation | Yes | Yes (coverage 0.25 < 0.6, LLM not called) | **GO** |
| Offline map with Greek labels | Yes | Yes, render 327 ms | **GO** |
| APK arm64 | < 80 MB | **55.3 MB** | **GO** |
| WebView: zero network requests | 0 | 0 blocked requests across 3 full E2E runs | **GO** |
| Model load | < 10 s | 1.1–2.7 s (warm page cache) | **GO** |
| First token with ~800 tokens of context | < 4 s | **12.1–18.4 s** | **NO-GO (for T1 as specified)** |

**Overall: GO for the stack** (Expo + libkiwix + llama.rn + MapLibre/PMTiles). The library, the map and grounding work, and the size fits. **The AI on T1 does not pass the latency gate** and needs a decision before Phase 1 (see "Recommendations"). Under the principle "knowledge first, AI second", this does not block the project.

> Important: measurements were taken on a **Galaxy S23 (8 GB)**, a **T2**-class device, not the 4 GB T1 reference device. For search, articles and maps the headroom is 15–40×, so they are not at risk. For the LLM, a cheap T1 phone will be **considerably slower** than the 80–114 tok/s prefill measured here. A measurement on a real T1 device remains open.

## Device and conditions

| | |
| --- | --- |
| Device | Samsung Galaxy S23, SM-S911B (`dm1q`) |
| SoC / CPU | Snapdragon 8 Gen 2 (SM8550), 8 cores: 3×2.02 + 4×2.80 + 1×3.36 GHz |
| RAM | 8 GB (7072 MB visible to Android) |
| OS / WebView | Android 16 (SDK 36) · Android System WebView 153.0.8010.36 |
| Conditions | Airplane mode, charging over USB, thermal `nominal` at the start of each bench |
| Build | `./gradlew assembleRelease`, arm64-v8a, Hermes, New Architecture, no EAS |
| Content | `wikipedia_el_top_mini_2026-07` (113 MB, 102,609 articles) and `wikipedia_el_all_mini_2026-09` (524 MB, 383,824 articles) · Qwen2.5-1.5B-Instruct Q4_K_M (+ Q4_0 for comparison) · Achaia PMTiles (21.6 MB, z0–15) |

## Detailed measurements

All times include the JS↔native bridge (Expo module, JSI). 20 fixed queries per category after warm-up.

| Measurement | top_mini · no ICU | top_mini · with ICU | all_mini · no ICU | all_mini · with ICU | Gate |
| --- | --- | --- | --- | --- | --- |
| Suggest p50 / p95 (ms) | 5.7 / 13.2 | 7.3 / 14.9 | 4.4 / 9.1 | 9.8 / 23.4 | < 50 |
| Full-text p50 / p95 (ms) | 4.0 / 7.8 | 4.1 / 6.9 | 5.8 / 18.8 | 9.5 / 24.9 | < 300 |
| Article HTML p95 (ms) | 12.5 | 12.5 | 6.1 | 8.9 | < 500 |
| Plain text (jsoup) p95 (ms) | 22.4 | 22.5 | 15.8 | 15.7 | — |
| ZIM file open (ms) | 23 | — | 23 | — | — |
| libkiwix native init (ms) | 11–17 | 17 | — | — | — |

The full article open time in the WebView (navigation → `onPageFinished`) was **321 ms** in E2E.

**LLM (Qwen2.5-1.5B-Instruct, T1 settings: n_ctx 2048, mmap, no mlock, CPU)**

| Configuration (prompt ~1175 tokens, ~800 tokens of context) | Prefill tok/s | TTFT (ms) |
| --- | --- | --- |
| Q4_K_M · 5 performance cores, pinned | 91–97 | 12,129–12,915 |
| Q4_K_M · 5 threads, no affinity | 82–90 | 13,048–15,999 |
| Q4_K_M · 4 fastest cores, pinned | 76–83 | 14,152–17,356 |
| Q4_K_M · 5 pinned + flash attention (CPU) | 49–86 | 13,681–23,950 |
| Q4_K_M · 8 threads (all cores) | 62–76 | 15,475–21,215 |
| **Q4_0** · 5 pinned / unpinned | **113–114** | **10,286–10,376** |

| | Value |
| --- | --- |
| Model load | 1.1–2.7 s (one cold measurement of 13.4 s after memory pressure) |
| Decode | 16–21 tok/s |
| llama.rn library selected | `rnllama_jni_v8_2_dotprod_i8mm` |
| Peak RSS (VmHWM) | 3.27–3.38 GB during the sweep (5–7 consecutive load/unload cycles) · 2.3 GB with a single load |
| Token estimator vs real tokenizer | ratio 0.98 after calibration (0.52 before) |

## APK and native libraries

| Build | Size | What changed |
| --- | --- | --- |
| First build | 146.5 MB | 7 llama.rn variants, uncompressed libs (`useLegacyPackaging=false`), prebuilt Hexagon assets |
| Final | **55.3 MB** | Only 3 llama.rn CPU variants (v8, v8.2+dotprod, v8.2+dotprod+i8mm), compressed libs, no HTP assets |

Largest native libraries in the final APK (MB, installed / inside the APK):

| Library | Raw | In APK |
| --- | --- | --- |
| `libkiwix.so` | 11.39 | 3.84 |
| `libmaplibre.so` | 10.85 | 3.79 |
| `libzim.so` | 9.68 | 3.24 |
| `librnllama_v8_2_dotprod_i8mm.so` | 8.69 | 3.57 |
| `librnllama_v8_2_dotprod.so` | 8.67 | 3.56 |
| `librnllama_v8.so` | 8.61 | 3.53 |
| `librnllama.so` | 8.58 | 3.52 |
| `libreactnative.so` | 6.99 | 2.32 |
| `libhermesvm.so` | 2.48 | 1.04 |
| **ICU data** | **0** (not included) | 0 |

Total native: 90.7 MB raw / 33.1 MB in the APK. Dex 15.1 MB (no R8), JS bundle 2.5 MB, map assets 1.3 MB.

**ICU:** `libkiwix.so` and `libzim.so` statically link ICU 73.2 **without data** (only a 64-byte `icudt73_dat` stub). The full `icudt73l.dat` is 32.0 MB (12.4 MB zipped). With and without it, 8 probes (`Πάτρα / πατρα / ΠΑΤΡΑ`, `σεισμός / σεισμος / ΣΕΙΣΜΟΣ`, `Αχαΐα / αχαια`) returned **identical** results, identical estimated matches and identical latency (within noise). For Greek and English **no ICU data is needed**. kiwix-android bundles ICU 58 data under the wrong name, so in practice it also runs without it.

The release APK **has no INTERNET permission** (and no location): offline by construction. Only `ACCESS_NETWORK_STATE` and `ACCESS_WIFI_STATE` remain, from libraries. (Phase 1 downloads will add INTERNET, used only by `ContentStore`.)

## Findings

### libkiwix binding (the project's main risk)

- There is an **official AAR on Maven Central** (`org.kiwix:libkiwix:2.6.0`, libkiwix 14.2.1, libzim 9.7.0). kiwix-build was not needed. Its SHA-256 is pinned in `native/kiwix/kiwix.lock.json` and checked on every build by a Gradle task.
- The Java API is complete (Archive, Searcher, SuggestionSearcher, Entry/Item/Blob). The work was ~780 lines of Kotlin (including the WebView, jsoup and device probes) and a few hours until the first search on the device. **The fallback was not needed.**
- Pitfalls: (a) `SearchIterator` getters refer to the item that the **next** `next()` call will return; (b) every native object needs an explicit `dispose()`; (c) Xapian handles are not thread-safe (one lock per archive); (d) libzim parses full-text with `OP_AND` and without `FLAG_BOOLEAN`, so RAG runs a conjunctive query plus per-word fallbacks merged with RRF; (e) folders created by `adb` under `Android/data/<pkg>` are not readable by the app (Android 11+), so the module creates them itself.
- The AAR declares `allowBackup=true` and ships x86/armv7 libs (removed by the ABI split).

### llama.rn (0.12.9)

- Built **from source** (`rnllamaBuildFromSource=true`), without the postinstall download. Requires NDK 27.3 and ~15 minutes. It produces 7 arm64 variants; we keep 3, and the runtime fallback (`tryLoadLibrary`) works.
- **CPU prefill is the bottleneck:** ~80–97 tok/s with Q4_K_M, 114 tok/s with Q4_0 (ARM repack) on a flagship. Flash attention on CPU is **slower**. Pinning to the performance cores gives +5–10%, but once dropped to 37 tok/s (thermal/scheduler).
- `n_parallel: 1` caused a **SIGSEGV** inside llama.cpp (`llama_kv_cache::cpy_k`). The default stays.
- With `response_format` (JSON schema), llama.rn **did not add the generation prompt**: the model wrote `<|im_start|>assistant` itself. Fix: explicit `add_generation_prompt: true`.
- **Tokenizer:** Qwen2.5 costs ~0.95 tokens per Greek character (~4× English). The T1 "800 tokens" fit only ~800 characters of Greek text (3–4 passages).

### Grounding and citations

- In free-form text (prompts v1 and v2), the 1.5B model **answered correctly but never added `[S1]`**. Post-validation correctly marked it "Unverified".
- Fix (prompt v3): **grammar-constrained JSON** `{covered, sentences[{text, source ∈ enum ids}]}` from a JSON schema → GBNF, plus a deterministic **per-sentence support check** (stem overlap ≥ 0.5 with the source; every number must appear verbatim). E2E result: `cited=S1,S2`, support 1.00/1.00/1.00.
- **Limitation:** the check is lexical. An incoherent sentence ("the athlete … who has 1884 [S2]") passed with support 1.00, and the model adds irrelevant but supported sentences from lower-ranked passages. rag-eval is needed, and probably a relevance rule (the sentence must contain a term from the question).
- The no-source threshold (coverage ≥ 0.6 and BM25 ≥ 0.5) worked in both directions once question words and auxiliary verbs were removed from the keywords ("πόσους … βρίσκεται" had pushed coverage down to 0.5).

### Sealed reading (WebView)

- `zim://<archiveId>/<path>` with `shouldInterceptRequest` works, together with the ZIM's relative links, CSS and images. In WebView 153, Chromium resolves relative URLs correctly on a non-standard scheme. This must be checked on older WebView versions.
- The CSP is set both as a header and as a `<meta>` tag. `blockNetworkLoads` is on, Safe Browsing is off (otherwise it performs a lookup to Google), JS is off, file/content access is off, and there is no JS bridge. **0 blocked requests** across all E2E runs.

### Map

- `pmtiles://file://` on MapLibre Native Android 13.6.1 (via @maplibre/maplibre-react-native 11.4.1) works offline. Protomaps v5 style `light`/`el`, glyphs and sprites bundled via `asset://`.
- The extract is deterministic (same SHA-256 on repeat). Protomaps daily builds expire, however, so the catalog-builder must keep its own copy.
- Cosmetic: uppercase labels keep accents ("ΑΝΘΟΎΠΟΛΗ") because of `text-transform: uppercase`.

### Tooling (Windows)

- RN codegen paths exceed 260 characters. The SDK's CMake 3.22 ships ninja 1.10 without long-path support. Fix: CMake 3.31.6 (ninja 1.12) via a config plugin.
- Maestro `-e` on Windows corrupts Greek text (code page). Values go into the YAML `env:` block instead.
- Play Protect asks on every `adb install` whether to send the APK to Google. We answer "Don't send".

## Deviations from the spec

1. **Article viewer:** a native `ZimArticleView` (Kotlin `WebView`) inside `expo-zim`, **not** `react-native-webview`. react-native-webview exposes neither `shouldInterceptRequest` (Android) nor `WKURLSchemeHandler` (iOS), so it would need a third-party library patch on both platforms. It would also bring a JS-bridge mechanism we do not want. The native view is smaller, fully controlled, and the same design carries over to iOS.
2. **ZIM:** both the smallest (`top_mini`, as requested) and `all_mini` were measured, because top_mini (103k articles) underestimates index size.
3. **Answers in grammar-constrained JSON** instead of free text with `[S1]` (see above; the prompt is versioned, `rag-t1-v3-json`).
4. The DeviceProfile probes (RAM, cores, battery, thermal) temporarily live in `expo-zim`. In Phase 1 they move to `modules/expo-device-profile`.

## Risks for iOS

- **CoreKiwix.xcframework:** there is no equivalent ready-made Swift API. A binding in Objective-C++/Swift over the C++ API must be written. More work than on Android, and it needs a Mac.
- **ICU:** on iOS, ICU is usually bundled with data in the xcframework. Its size must be measured.
- **WKURLSchemeHandler** for `zim://` and CSP: expected to work, but untested.
- **PMTiles `file://` on an iPhone:** the test on a real device remains (MapLibre iOS ≥ 6.10).
- **llama.rn on iOS:** Metal offload is expected to fix prefill (GPU). It does not run on the simulator.
- **GPL and the App Store:** open legal question (already in the architecture).

## Recommendations for Phase 1

1. **AI latency on T1** (decision before Phase 1). Options in order of effectiveness:
   - smaller prompt on T1: ~400–500 tokens of context (2 passages) and a shorter system prompt;
   - **Q4_0** quantisation (+22% prefill);
   - a smaller model (0.5B) or a model with a better tokenizer for Greek (measured in rag-eval);
   - UX that does not wait for the LLM: show sources immediately (`sources_only`) and the answer when it is ready;
   - reuse the system prompt's KV cache (llama.rn keeps the prefix).

   The TTFT < 4 s target for T1 is **unrealistic** with a 1.5B model on CPU and 800 Greek tokens. Proposed revision: TTFT < 4 s **for the sources** and < 15 s for the answer.
2. **rag-eval** from the start of Phase 1, with citation precision and relevance metrics (the lexical support check is not enough).
3. **ICU data stays out of the APK.** If other languages need it, ship it as a catalog pack.
4. R8/minify (dex 15 MB), after keep rules for `org.kiwix.**` and `com.rnllama.**`.
5. Measurement on a real **4 GB T1 device**, and battery measurement per answer.

> Decisions taken after this report (see `docs/architecture.md`): English-first content; two-layer answers (Layer 1 extractive < 1 s, Layer 2 AI summary); first token < 15 s on T2 with the T1 target set after measurement; T1-simulation mode on the S23 until a 4 GB device is available; bigram support check and a strict numeric/unit rule.

## Reproduction

```powershell
pnpm install; pnpm verify
cd apps/mobile; npx expo prebuild --platform android --clean
cd android; ./gradlew assembleRelease              # app/build/outputs/apk/release/app-arm64-v8a-release.apk
adb install -r app/build/outputs/apk/release/app-arm64-v8a-release.apk
powershell -ExecutionPolicy Bypass -File scripts/provision.ps1                 # top_mini, Q4_K_M, Achaia PMTiles
# variants: -ZimVariant all_mini, -WithIcu, -WithCompareModel (Q4_0)
powershell -ExecutionPolicy Bypass -File e2e/run-spike.ps1                     # Maestro in airplane mode + blocked-log check
```

Bench: **Bench → Run bench** tab. The JSON is written to `/sdcard/Android/data/org.skepi.app/files/bench/latest.json`.
Files in `docs/spike/`: `bench-top_mini-noicu-q4compare.json` (sweep + Q4_0 comparison; it ran before the `add_generation_prompt` fix, so its RAG answer has no citations), `bench-top_mini-icu.json`, `bench-all_mini-noicu.json`, `bench-all_mini-icu.json`.
