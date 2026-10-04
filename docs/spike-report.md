# Φάση 0 · Spike report (Android)

Ημερομηνία: 2026-10-04 · Τεκμήρια: [`docs/spike/`](spike/) (bench JSON, screenshots E2E, Maestro JUnit report)

## Απόφαση

| Αντικείμενο | Πύλη | Αποτέλεσμα | Go / No-go |
| --- | --- | --- | --- |
| Binding libkiwix/libzim σε Expo module | Να λειτουργεί | Επίσημο AAR `org.kiwix:libkiwix:2.6.0`, ~780 γραμμές Kotlin | **GO** |
| Προτάσεις (suggest) p95 | < 50 ms | 13.2 ms (top, 103k άρθρα) · 9.1 ms (all, 384k) | **GO** |
| Full-text p95 | < 300 ms | 7.8 ms (top) · 18.8 ms (all) | **GO** |
| Άνοιγμα άρθρου | < 500 ms | HTML p95 12.5 ms · πλήρες render στο WebView 321 ms | **GO** |
| Απάντηση με ≥ 1 έγκυρη πηγή που ανοίγει το σωστό άρθρο | Ναι | Ναι (E2E: `[S1] Πάτρα` → άρθρο «Πάτρα») | **GO** |
| Άσχετη ερώτηση → «δεν βρέθηκε πηγή» χωρίς generation | Ναι | Ναι (coverage 0.25 < 0.6, LLM δεν καλείται) | **GO** |
| Χάρτης offline με ελληνικά labels | Ναι | Ναι, render 327 ms | **GO** |
| APK arm64 | < 80 MB | **55.3 MB** | **GO** |
| WebView: μηδέν δικτυακά αιτήματα | 0 | 0 blocked requests σε 3 πλήρη E2E | **GO** |
| Φόρτωση μοντέλου | < 10 s | 1.1–2.7 s (ζεστό page cache) | **GO** |
| Πρώτο token με context ~800 tokens | < 4 s | **12.1–18.4 s** | **NO-GO (για T1 όπως είναι)** |

**Συνολικά: GO για τη στοίβα** (Expo + libkiwix + llama.rn + MapLibre/PMTiles). Η βιβλιοθήκη, ο χάρτης και το
grounding δουλεύουν, και το μέγεθος χωράει. **Το AI στο T1 δεν περνά την πύλη latency** και χρειάζεται απόφαση πριν
τη Φάση 1 (βλ. «Προτάσεις»). Σύμφωνα με την αρχή «η γνώση πρώτα, το AI δεύτερο», αυτό δεν μπλοκάρει το project.

> Σημαντικό: οι μετρήσεις έγιναν σε **Galaxy S23 (8 GB)**, δηλαδή συσκευή κλάσης **T2**, όχι στη συσκευή αναφοράς T1
> (4 GB). Για αναζήτηση/άρθρα/χάρτη το περιθώριο είναι 15–40×, άρα δεν κινδυνεύουν. Για το LLM, ένα φθηνό T1 θα είναι
> **αρκετά πιο αργό** από τα 80–114 tok/s prefill που μετρήθηκαν εδώ. Μέτρηση σε πραγματικό T1 μένει ανοιχτή.

## Συσκευή και συνθήκες

| | |
| --- | --- |
| Συσκευή | Samsung Galaxy S23, SM-S911B (`dm1q`) |
| SoC / CPU | Snapdragon 8 Gen 2 (SM8550), 8 cores: 3×2.02 + 4×2.80 + 1×3.36 GHz |
| RAM | 8 GB (7072 MB ορατά στο Android) |
| OS / WebView | Android 16 (SDK 36) · Android System WebView 153.0.8010.36 |
| Συνθήκες | Airplane mode, φόρτιση μέσω USB, thermal `nominal` στην αρχή κάθε bench |
| Build | `./gradlew assembleRelease`, arm64-v8a, Hermes, New Architecture, χωρίς EAS |
| Περιεχόμενο | `wikipedia_el_top_mini_2026-07` (113 MB, 102 609 άρθρα) και `wikipedia_el_all_mini_2026-09` (524 MB, 383 824 άρθρα) · Qwen2.5-1.5B-Instruct Q4_K_M (+ Q4_0 για σύγκριση) · Achaia PMTiles (21.6 MB, z0–15) |

## Μετρήσεις αναλυτικά

Όλοι οι χρόνοι περιλαμβάνουν τη γέφυρα JS↔native (Expo module, JSI). 20 σταθερά queries ανά κατηγορία μετά από warm-up.

| Μέτρηση | top_mini · χωρίς ICU | top_mini · με ICU | all_mini · χωρίς ICU | all_mini · με ICU | Πύλη |
| --- | --- | --- | --- | --- | --- |
| Suggest p50 / p95 (ms) | 5.7 / 13.2 | 7.3 / 14.9 | 4.4 / 9.1 | 9.8 / 23.4 | < 50 |
| Full-text p50 / p95 (ms) | 4.0 / 7.8 | 4.1 / 6.9 | 5.8 / 18.8 | 9.5 / 24.9 | < 300 |
| Article HTML p95 (ms) | 12.5 | 12.5 | 6.1 | 8.9 | < 500 |
| Plain text (jsoup) p95 (ms) | 22.4 | 22.5 | 15.8 | 15.7 | — |
| Άνοιγμα αρχείου ZIM (ms) | 23 | — | 23 | — | — |
| Native init libkiwix (ms) | 11–17 | 17 | — | — | — |

Ο πλήρης χρόνος ανοίγματος άρθρου στο WebView (navigation → `onPageFinished`) ήταν **321 ms** στο E2E.

**LLM (Qwen2.5-1.5B-Instruct, T1 ρυθμίσεις: n_ctx 2048, mmap, χωρίς mlock, CPU)**

| Ρύθμιση (prompt ~1175 tokens, ~800 tokens context) | Prefill tok/s | TTFT (ms) |
| --- | --- | --- |
| Q4_K_M · 5 performance cores, pinned | 91–97 | 12 129–12 915 |
| Q4_K_M · 5 threads, χωρίς affinity | 82–90 | 13 048–15 999 |
| Q4_K_M · 4 ταχύτεροι cores, pinned | 76–83 | 14 152–17 356 |
| Q4_K_M · 5 pinned + flash attention (CPU) | 49–86 | 13 681–23 950 |
| Q4_K_M · 8 threads (όλοι οι cores) | 62–76 | 15 475–21 215 |
| **Q4_0** · 5 pinned / unpinned | **113–114** | **10 286–10 376** |

| | Τιμή |
| --- | --- |
| Φόρτωση μοντέλου | 1.1–2.7 s (μία cold μέτρηση 13.4 s μετά από πίεση μνήμης) |
| Decode | 16–21 tok/s |
| Επιλεγμένη βιβλιοθήκη llama.rn | `rnllama_jni_v8_2_dotprod_i8mm` |
| Peak RSS (VmHWM) | 3.27–3.38 GB κατά το sweep (5–7 διαδοχικά load/unload) · 2.3 GB με ένα φόρτωμα |
| Token estimator vs πραγματικός tokenizer | ratio 0.98 μετά το calibration (πριν 0.52) |

## APK και native βιβλιοθήκες

| Έκδοση | Μέγεθος | Τι άλλαξε |
| --- | --- | --- |
| Πρώτο build | 146.5 MB | 7 variants llama.rn, libs ασυμπίεστα (`useLegacyPackaging=false`), prebuilt Hexagon assets |
| Τελικό | **55.3 MB** | Μόνο 3 CPU variants llama.rn (v8, v8.2+dotprod, v8.2+dotprod+i8mm), libs συμπιεσμένα, χωρίς HTP assets |

Μεγαλύτερες native βιβλιοθήκες στο τελικό APK (MB, εγκατεστημένο / μέσα στο APK):

| Βιβλιοθήκη | Raw | Στο APK |
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
| **ICU data** | **0** (δεν περιέχεται) | 0 |

Σύνολο native: 90.7 MB raw / 33.1 MB στο APK. Dex 15.1 MB (χωρίς R8), JS bundle 2.5 MB, map assets 1.3 MB.

**ICU:** Τα `libkiwix.so` και `libzim.so` κάνουν static link το ICU 73.2 **χωρίς δεδομένα** (μόνο stub `icudt73_dat`
64 bytes). Το πλήρες `icudt73l.dat` είναι 32.0 MB (12.4 MB zip). Με και χωρίς αυτό, 8 probes (`Πάτρα / πατρα / ΠΑΤΡΑ`,
`σεισμός / σεισμος / ΣΕΙΣΜΟΣ`, `Αχαΐα / αχαια`) έδωσαν **ίδια** αποτελέσματα, ίδια estimated matches και ίδια
latency (εντός θορύβου). Για ελληνικά/αγγλικά **δεν χρειάζεται ICU data**. Το kiwix-android ενσωματώνει ICU 58 data
με λάθος όνομα, άρα στην πράξη τρέχει κι αυτό χωρίς.

Το APK release **δεν έχει άδεια INTERNET** (ούτε location): offline εκ κατασκευής. Μένουν μόνο
`ACCESS_NETWORK_STATE` και `ACCESS_WIFI_STATE` από βιβλιοθήκες.

## Ευρήματα

### Binding libkiwix (κύριο ρίσκο του project)

- Υπάρχει **επίσημο AAR στο Maven Central** (`org.kiwix:libkiwix:2.6.0`, libkiwix 14.2.1, libzim 9.7.0). Δεν χρειάστηκε
  kiwix-build. Το SHA-256 κλειδώνεται στο `native/kiwix/kiwix.lock.json` και ελέγχεται σε κάθε build από Gradle task.
- Το Java API είναι πλήρες (Archive, Searcher, SuggestionSearcher, Entry/Item/Blob). Η δουλειά ήταν ~780 γραμμές
  Kotlin (μαζί με WebView, jsoup και device probes) και λίγες ώρες μέχρι την πρώτη αναζήτηση στη συσκευή. **Δεν χρειάστηκε το fallback.**
- Παγίδες: (α) οι getters του `SearchIterator` αφορούν το στοιχείο που θα επιστρέψει το **επόμενο** `next()`·
  (β) κάθε native αντικείμενο θέλει ρητό `dispose()`· (γ) τα Xapian handles δεν είναι thread-safe (lock ανά archive)·
  (δ) το libzim κάνει parse full-text με `OP_AND` και χωρίς `FLAG_BOOLEAN`, οπότε το RAG κάνει conjunctive query και
  fallbacks ανά λέξη με RRF· (ε) οι φάκελοι που φτιάχνει το `adb` στο `Android/data/<pkg>` δεν διαβάζονται από το app
  (Android 11+), οπότε τους φτιάχνει το ίδιο το module.
- Το AAR δηλώνει `allowBackup=true` και φέρνει x86/armv7 libs (κόβονται με ABI split).

### llama.rn (0.12.9)

- Build **από source** (`rnllamaBuildFromSource=true`), χωρίς το postinstall download. Χρειάζεται NDK 27.3 και
  ~15 λεπτά. Βγάζει 7 arm64 variants· κρατάμε 3, το runtime fallback (`tryLoadLibrary`) δουλεύει.
- **Prefill στο CPU είναι ο περιορισμός:** ~80–97 tok/s με Q4_K_M, 114 tok/s με Q4_0 (ARM repack) σε flagship.
  Το flash attention σε CPU είναι **πιο αργό**. Pinning στους performance cores δίνει +5–10%, αλλά μία φορά έπεσε στα
  37 tok/s (thermal/scheduler).
- Το `n_parallel: 1` έριξε **SIGSEGV** μέσα στο llama.cpp (`llama_kv_cache::cpy_k`). Μένει το default.
- Με `response_format` (JSON schema) το llama.rn **δεν πρόσθετε generation prompt**: το μοντέλο έγραφε μόνο του
  `<|im_start|>assistant`. Λύση: ρητό `add_generation_prompt: true`.
- **Tokenizer:** το Qwen2.5 κοστίζει ~0.95 tokens ανά ελληνικό χαρακτήρα (~4× τα αγγλικά). Τα «800 tokens» του T1
  χωράνε μόνο ~800 χαρακτήρες ελληνικού κειμένου (3–4 αποσπάσματα).

### Grounding και παραπομπές

- Σε ελεύθερο κείμενο (prompt v1 και v2) το 1.5B **απαντούσε σωστά αλλά δεν έβαζε ποτέ `[S1]`**. Το post-validation
  σωστά το σήμαινε «Χωρίς επαλήθευση».
- Λύση (prompt v3): **grammar-constrained JSON** `{covered, sentences[{text, source ∈ enum ids}]}` από JSON schema
  → GBNF, και ντετερμινιστικός **έλεγχος υποστήριξης ανά πρόταση** (επικάλυψη stems ≥ 0.5 με την πηγή, κάθε αριθμός
  να υπάρχει αυτούσιος). Αποτέλεσμα στο E2E: `cited=S1,S2`, support 1.00/1.00/1.00.
- **Όριο:** ο έλεγχος είναι λεξικός. Μια ασυνάρτητη πρόταση («ο αθλητής … που έχει 1884 [S2]») πέρασε με support
  1.00, και το μοντέλο προσθέτει άσχετες αλλά τεκμηριωμένες προτάσεις από χαμηλότερα αποσπάσματα. Χρειάζεται
  rag-eval και πιθανώς κανόνας relevance (η πρόταση να περιέχει όρο της ερώτησης).
- Το no-source κατώφλι (coverage ≥ 0.6 και BM25 ≥ 0.5) δούλεψε και στις δύο κατευθύνσεις, αφού αφαιρέθηκαν
  ερωτηματικά/βοηθητικά ρήματα από τα keywords (το «πόσους … βρίσκεται» έριχνε το coverage στο 0.5).

### Σφραγισμένη ανάγνωση (WebView)

- Το `zim://<archiveId>/<path>` με `shouldInterceptRequest` δουλεύει, μαζί με τα σχετικά links, το CSS και τις
  εικόνες του ZIM. Στο WebView 153 το Chromium λύνει σωστά relative URLs σε μη-standard scheme. Σε παλιότερα WebView
  αυτό πρέπει να ελεγχθεί.
- Το CSP μπαίνει και ως header και ως `<meta>`. Υπάρχουν `blockNetworkLoads`, Safe Browsing off (αλλιώς πάει lookup
  στην Google), JS off, χωρίς file/content access, και καμία γέφυρα JS. **0 blocked requests** σε όλα τα E2E.

### Χάρτης

- `pmtiles://file://` σε MapLibre Native Android 13.6.1 (μέσω @maplibre/maplibre-react-native 11.4.1) δουλεύει offline.
  Style Protomaps v5 `light`/`el`, glyphs και sprites ενσωματωμένα με `asset://`.
- Το extract είναι ντετερμινιστικό (ίδιο SHA-256 σε επανάληψη). Τα daily builds του Protomaps όμως λήγουν, οπότε το
  catalog-builder πρέπει να κρατά δικό του αντίγραφο.
- Κοσμητικό: τα κεφαλαία labels κρατούν τόνους («ΑΝΘΟΎΠΟΛΗ») λόγω `text-transform: uppercase`.

### Εργαλεία (Windows)

- Τα paths του RN codegen ξεπερνούν τους 260 χαρακτήρες. Η CMake 3.22 του SDK έχει ninja 1.10 χωρίς long paths.
  Λύση: CMake 3.31.6 (ninja 1.12) μέσω config plugin.
- Το Maestro `-e` στα Windows αλλοιώνει τα ελληνικά (code page). Οι τιμές μπαίνουν στο `env:` του YAML.
- Το Play Protect ρωτά σε κάθε `adb install` αν θα στείλει το APK στην Google. Απαντάμε «Don't send».

## Αποκλίσεις από το spec

1. **Article viewer:** native `ZimArticleView` (Kotlin `WebView`) μέσα στο `expo-zim`, **όχι** `react-native-webview`.
   Το react-native-webview δεν εκθέτει `shouldInterceptRequest` (Android) ούτε `WKURLSchemeHandler` (iOS), άρα θα
   χρειαζόταν patch σε βιβλιοθήκη τρίτου και στις δύο πλατφόρμες. Θα κουβαλούσε επίσης μηχανισμό JS bridge που δεν
   θέλουμε. Ο native view είναι μικρότερος, πλήρως ελεγχόμενος, και ο ίδιος σχεδιασμός μεταφέρεται στο iOS.
2. **ZIM:** μετρήθηκαν και το μικρότερο (`top_mini`, όπως ζητήθηκε) και το `all_mini`, γιατί το top_mini (103k άρθρα)
   υποεκτιμά το μέγεθος του ευρετηρίου.
3. **Απαντήσεις σε JSON με grammar** αντί για ελεύθερο κείμενο με `[S1]` (βλ. παραπάνω· το prompt είναι versioned,
   `rag-t1-v3-json`).
4. Οι DeviceProfile probes (RAM, cores, μπαταρία, thermal) ζουν προσωρινά στο `expo-zim`. Στη Φάση 1 πάνε στο
   `modules/expo-device-profile`.

## Ρίσκα για iOS

- **CoreKiwix.xcframework:** δεν υπάρχει αντίστοιχο έτοιμο Swift API. Θα γραφτεί binding σε Objective-C++/Swift πάνω
  στο C++ API. Είναι μεγαλύτερη δουλειά από το Android, και θέλει Mac.
- **ICU:** στο iOS το ICU συνήθως ενσωματώνεται με δεδομένα στο xcframework. Πρέπει να μετρηθεί το μέγεθος.
- **WKURLSchemeHandler** για `zim://` και CSP: αναμένεται να δουλέψει, αλλά δεν δοκιμάστηκε.
- **PMTiles `file://` σε iPhone:** μένει το test σε πραγματική συσκευή (MapLibre iOS ≥ 6.10).
- **llama.rn σε iOS:** Metal offload αναμένεται να λύσει το prefill (GPU). Δεν δουλεύει σε simulator.
- **GPL και App Store:** ανοιχτό νομικό ζήτημα (ήδη στο architecture).

## Προτάσεις για Φάση 1

1. **Latency του AI στο T1** (απόφαση πριν τη Φάση 1). Επιλογές με σειρά αποτελεσματικότητας:
   - μείωση του prompt στο T1: ~400–500 tokens context (2 αποσπάσματα) και συντομότερο system prompt·
   - quantisation **Q4_0** (+22% prefill)·
   - μικρότερο μοντέλο (0.5B) ή μοντέλο με καλύτερο tokenizer για ελληνικά (μετρημένο στο rag-eval)·
   - UX που δεν περιμένει το LLM: εμφάνιση πηγών αμέσως (`sources_only`) και απάντηση όταν γίνει έτοιμη·
   - επαναχρησιμοποίηση του KV cache του system prompt (το llama.rn κρατά το prefix).
   Ο στόχος TTFT < 4 s για T1 είναι **μη ρεαλιστικός** με 1.5B σε CPU και 800 ελληνικά tokens. Προτείνεται
   αναθεώρηση σε TTFT < 4 s **για τις πηγές** και < 15 s για την απάντηση.
2. **rag-eval** από την αρχή της Φάσης 1, με μετρικές citation precision και relevance (το λεξικό support check δεν αρκεί).
3. **ICU data εκτός APK.** Αν χρειαστεί για άλλες γλώσσες, να μπει ως πακέτο στο catalog.
4. R8/minify (dex 15 MB), μετά από keep rules για `org.kiwix.**` και `com.rnllama.**`.
5. Μέτρηση σε πραγματική **T1 συσκευή 4 GB**, και μέτρηση μπαταρίας ανά απάντηση.

## Αναπαραγωγή

```powershell
pnpm install; pnpm verify
cd apps/mobile; npx expo prebuild --platform android --clean
cd android; ./gradlew assembleRelease              # app/build/outputs/apk/release/app-arm64-v8a-release.apk
adb install -r app/build/outputs/apk/release/app-arm64-v8a-release.apk
powershell -ExecutionPolicy Bypass -File scripts/provision.ps1                 # top_mini, Q4_K_M, Achaia PMTiles
# παραλλαγές: -ZimVariant all_mini, -WithIcu, -WithCompareModel (Q4_0)
powershell -ExecutionPolicy Bypass -File e2e/run-spike.ps1                     # Maestro σε airplane mode + έλεγχος blocked log
```

Bench: καρτέλα **Bench → Run bench**. Το JSON γράφεται στο `/sdcard/Android/data/org.skepi.app/files/bench/latest.json`.
Τα αρχεία στο `docs/spike/`: `bench-top_mini-noicu-q4compare.json` (sweep + σύγκριση Q4_0· έτρεξε πριν τη διόρθωση
του `add_generation_prompt`, οπότε η RAG απάντησή του δεν έχει παραπομπές), `bench-top_mini-icu.json`,
`bench-all_mini-noicu.json`, `bench-all_mini-icu.json`.
