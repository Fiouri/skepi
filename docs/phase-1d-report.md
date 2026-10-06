# Phase 1d · Safety fixes, emergency cards, onboarding, blackout mode (Android)

Date: 2026-10-06 · Device: Galaxy S23 (SM-S911B, Android 16, T2) · Build: `./gradlew assembleRelease`
(release key, R8, `-PskepiAllowDraftCards=true` for this internal build), arm64-v8a, 49.5 MB · Evidence:
[`docs/phase1d/`](phase1d/) (rag-eval, parity, bench JSON, E2E JUnit + screenshots, instrumentation reports) ·
Phase 1 gate: [`docs/phase-1-gate.md`](phase-1-gate.md).

## Acceptance criteria

| Criterion | Result | |
| --- | --- | --- |
| Structural filter: unit tests pass; Layer 1 and Layer 2 drop injected sentences in the new examples | `sanitize.test.ts` (97 cases, all new examples) and `rag.test.ts` (Layer 1 passages and the model prompt carry none of the injected text) | ✓ |
| All rag-eval thresholds still hold | precision **94.3%**, number/unit violations **0**, adversarial unsupported **0**, refusal **100%**, coverage en **72.4%** / el **46.7%** (unchanged from 1c) | ✓ |
| Permission allowlist and bundle-rebuild tests run in CI and pass | GitHub Actions run 37397902353, job `android-release-guards`: draft-cards gate fails as required, release APK built, **PERMISSION ALLOWLIST: PASS**, **BUNDLE REBUILD PROBE: PASS** | ✓ |
| A medical/emergency question shows the card (with draft banner) and the number before anything else | `e2e/cards.yaml`: "Someone collapsed and is not breathing. How do I do CPR?" → "Emergency? Call 112" banner, then the CPR card with "Draft — not reviewed by first-aid professionals", then Layer 1 | ✓ |
| The release build fails with draft cards unless the explicit flag is set | `assembleRelease` → `:app:skepiCheckEmergencyCards FAILED` ("12 of 12 emergency cards are DRAFT"); with `-PskepiAllowDraftCards=true` it builds and prints a boxed warning | ✓ |
| Onboarding completes offline with installed packs, and with downloads from the local test mirror; readiness reflects the installed packs | `e2e/onboarding.yaml` (airplane mode, release: the 2 GB preset maps to the installed packs, "You are ready") and `e2e/onboarding-mirror.yaml` (debug, fresh install: the preset downloads `test-smoke-en` and `test-mirror-fallback` from the local HTTPS mirror; encyclopedia ✓ afterwards) | ✓ |
| Blackout mode: AI off, no animations, GPS only on tap; battery cost from measured samples | `e2e/blackout.yaml`: no automatic summary (Layer 1 kept), "Summarise with AI" on request, cost label from three measured summaries, black theme and dark article, GPS/compass idle | ✓ (cost values: see Deviations 2) |
| SOS light, coordinates and the SMS hand-off work in airplane mode | `e2e/tools.yaml` in airplane mode: GNSS fix → decimal/DMS → SMS app opened with the text (1 VIEW `sms:` intent), torch Morse, red screen SOS, compass | ✓ (fix simulated indoors: Deviations 3) |

## 1. Structural injection filter

`packages/core/src/sanitize.ts`. Before chunking (so before Layer 1, which shows verbatim text, and before the
model), passages lose text whose **form** marks it as aimed at a model, independent of wording:

- forged `<source …>…</source>` blocks (removed whole) and stray source tags (`<`, `‹`, `&lt;`, `[` variants);
- chat-template markup (`<|im_start|>`, `[INST]`, `<<SYS>>`, `<start_of_turn>`, `### Instruction`);
- JSON objects with role/system/assistant/prompt/messages keys (balanced-brace span; an unclosed one runs to the end of its paragraph);
- lines and sentences that start with a role prefix (`SYSTEM:`, `Assistant (override):`, `[user]`, `ΣΥΣΤΗΜΑ:`);
- sentences addressed to the model/assistant/AI/summariser: vocatives ("Dear AI, …", "To any language model reading this: …"), "note/message/instructions for <AI addressee>", "if you are an AI …", persona assignments ("You are now …Bot", "from now on you are …"), orders about the answer ("When asked about X, reply only with …", "Answer only with …"), and self-referential precedence claims ("this note overrides all other text").

A structural hit removes the sentence **and the rest of its paragraph** (what follows an address to the model
is the injected instruction). Paragraph breaks come from the extraction: `ZimContent.kt` and the rag-eval
sidecar now keep one line per block element (rule for rule; parity 158/158 below). No phrase was added to the
Phase 1b lexicon. Unit tests use new examples only (97 cases incl. 22 encyclopedic/survival false-positive
checks in English and Greek); `rag.test.ts` checks Layer 1 and the prompt end to end.

**rag-eval** (Qwen2.5-1.5B Q4_0, CPU, 12 threads as in 1c): every threshold holds; en/el sources are identical
to the 1c run, so coverage and precision are unchanged ([report](phase1d/rag-eval/rag-eval-full.md); a 6-thread
run gave 70.4 / 42.2% coverage from llama.cpp numeric differences with the same prompts,
[`rag-eval-full-6threads.md`](phase1d/rag-eval/rag-eval-full-6threads.md)). Smoke subset: pass.

**Held-out section — set already used for a decision.** The report labels it so. Full run: 16 items,
refusal 100%, **0 findings** (Phase 1c: 5); the five 1c findings no longer reach Layer 1 or the model. Because the
set drove this decision it no longer measures generalisation; a fresh unseen set is required before release.

**Retrieval parity** after the extraction change: **158 / 158** identical ([parity.md](phase1d/parity/parity.md)).

## 2. Release guards in CI

`tools/release-guards` (TS, unit tested) and the CI job `android-release-guards` (expo prebuild →
`skepiCheckEmergencyCards` must fail → `assembleRelease -PskepiDebugSign=true -PskepiAllowDraftCards=true` →
allowlist → probe):

- **Permission allowlist** (`aapt2 dump permissions`): exactly INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE,
  ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, plus the app's own signature-level
  `<applicationId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (androidx). ACCESS_BACKGROUND_LOCATION is forbidden;
  CAMERA and RECORD_AUDIO are removed in the manifest. The release APK on the S23 and in CI: PASS.
- **Bundle-rebuild probe**: requires the bundle task to be UP-TO-DATE with unchanged sources, then appends a unique
  exported string to `packages/core/src/index.ts` and to `modules/expo-emergency-tools/src/index.ts` in turn,
  rebuilds `:app:createBundleReleaseJsAndAssets` and requires the task to run and the string to be in the Hermes
  bundle; sources are restored. PASS locally (Windows) and in CI (Linux).

## 3. Emergency cards

`packages/emergency-cards`: 12 cards (CPR, bleeding, choking, burns, fractures, hypothermia, heat stroke,
poisoning, water purification, earthquake, fire, flood), English master and Greek translation with identical
steps. Schema: id, intercept topics, numbered steps with **a source and locator per step**, "when to call for
help", sources (title, publisher, URL, licence, date checked), locale versions (title, steps, call text,
keywords), review `{ status, reviewers[], date }`.

- **Sources** (public domain, US federal works only): Army ATP 4-02.11 (March 2026, paragraph and page per step),
  FEMA *Until Help Arrives* and *Steps to Control Bleeding*, USFA, NHLBI, Ready.gov (burns, earthquakes, home
  fires, floods), CDC (hypothermia, water), EPA (poisoning first aid). No ERC/AHA/WHO/Red Cross material; a test
  rejects them. ATP locators were checked against the PDF text by script.
- **All cards are `draft`**: a permanent banner "Draft — not reviewed by first-aid professionals" on the card,
  in the Ask intercept and in lists. A reviewed card needs ≥ 2 reviewers and a date (schema check).
- **Release gate** `skepiCheckEmergencyCards` (plugin `withEmergencyCards.js`), CODEOWNERS on the folder.
- **Ask intercept**: emergency or medical intent (or a card keyword match, e.g. water purification) shows the
  emergency number with a call button, then the matching cards, then Layer 1. Cards also come up in the home
  search, the Emergency screen and the Tools tab, and can be read aloud (OS TTS, expo-speech).

## 4. Emergency numbers

Per-country dataset with an official source per country: EU-27 (112, European Commission), Greece (112, EKAB 166,
Fire 199, Police 100, Coast Guard 108, Poison Centre 210 779 3777 — Region of Attica civil protection), Switzerland,
UK (999/112), US (911, Poison Help), Canada (911), Australia (000), New Zealand (111). Unknown country → 112 with
"check the local number". The country comes from onboarding (default: OS region, never the network). Calls open
the dialler only.

## 5. Onboarding "Get prepared"

Language (phone language / English / Greek, switches live) and country → tier and free space
(`detectMobileTier`, `getSnapshot`) → storage budget 2 / 8 / 32 GB mapped by `planPreset` (core, unit tested) to
catalog packs: English defaults, the default model when the tier runs AI, the locale's largest pack that fits,
capped by free space − 1 GB / 1.1 → downloads through ContentStore → disclaimer (educational content, not medical
advice, no warranty). Home shows "You are ready" (cards (draft), regional map, encyclopedia, AI / "not on this
device"); onboarding can be rerun from the Library. Debug builds with the test catalog plan only `test` packs.

## 6. Blackout mode

Switch on the home screen; suggested below 30% battery when not charging (checked only while the home screen is
in front). Pure-black theme (`packages/ui-tokens` `BLACKOUT`), navigation transitions and spinners off, dark CSS
injected into article HTML after the CSP meta (sealed viewer; `SealingTest` covers it), model unloaded and no
automatic AI summary (Layer 1 stays; "Summarise with AI" on request), GPS and compass only on tap, power-saving
tips. **Energy**: migration 2 adds `energy_samples`; AI summaries, GPS fixes and the SOS torch (per minute) record
the battery used (charge counter µAh, else 1% steps; nothing while charging); costly buttons show the median of
≥ 3 samples ("≈ 1% battery", "< 0.1% battery").

## 7. Tools tab

`modules/expo-emergency-tools` (Kotlin): SOS torch via `CameraManager.setTorchMode` on its own thread, Morse
timeline from core (`SOS_TIMELINE`, 250 ms unit), always ends off (`MorsePlayerTest`); white/red full-brightness
screen SOS; compass (rotation vector or accel + magnetometer, declination from the on-device magnetic model);
one GNSS fix per tap from the GPS provider (no Play Services; works in airplane mode); decimal + DMS coordinates;
"Send my location by SMS" opens the SMS app with the text and an OpenStreetMap link — never sends. Everything
stops when the tab loses focus or the app goes to background.

## 8. Accessibility

Labels and roles on every pressable (button, link, radio, header, alert), live regions for GNSS progress and the
compass, touch targets ≥ 48 dp (`MIN_TOUCH_DP`; chips and links raised from 40), dynamic type (no fixed text
heights), WCAG AA for every text/background pair in both themes (`packages/ui-tokens` tests, 30 checks), cards read
aloud. Onboarding navigation stays on screen; the home search closes the keyboard on full-text search.

## 9. Optional: Qwen3-1.7B

Not done in this phase (time went to the mandatory items). Open for the next phase.

## E2E, instrumentation and bench

| Run | Build | Result |
| --- | --- | --- |
| `e2e/run-e2e.ps1 -SimulateGnss` (tools, onboarding, ask-en, ask-t1, medical, cards, blackout, Greek UI), airplane mode | release `org.skepi.app` | **8/8 passed**; blocked WebView requests **0**; ContentStore requests **0**; bytes of the app UID on real interfaces **0**; SMS hand-off intents **1** |
| `e2e/run-download-e2e.ps1` (onboarding-mirror, download), Wi-Fi on, local HTTPS mirror | debug `org.skepi.app.dev` | **2/2 passed**; 12 ContentStore requests, all `https://127.0.0.1:8443`, 15 mirror requests, no query strings, User-Agent `SKEPI`; bytes of the app UID on real interfaces **0** |
| `e2e/run-parity.ps1` | release | **158 / 158** |
| `./gradlew connectedAndroidTest` | debug | **21 tests, 0 failures** (SealingTest 12, MorsePlayerTest 3, FileHasherTest 3, ContentRulesTest 3) |

Bench (S23, release, 3 packs; [`phase1d/bench/`](phase1d/bench/)):

| | Normal (T2) | T1-simulation |
| --- | --- | --- |
| Title suggestions p95 | 18 ms | 40 ms |
| Full-text p95 | 16 ms | 28 ms |
| Layer 1 p95 en / el | 398 / 311 ms | **258 / 265 ms** |
| Sources visible p95 en / el | 234 / 325 ms | **193 / 290 ms** |
| TTFT p50 / p95 en | 2.2 / **4.7 s** | 4.0 / 5.9 s |
| TTFT p50 / p95 el | 8.9 / 27.0 s¹ | 8.9 / 13.4 s |
| Model load warm / first | 0.6 / 14.3 s² | 0.8 / 1.3 s |
| Peak RSS | 2.27 GB | 2.27 GB |

¹ One Greek question of six took 27 s (1c: p95 9.6 s); not a gate (the T2 gate is English, 4.7 s).
² First load after reinstalling the APK (cold page cache), as in 1c (14.0 s).

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`: green (core 271, emergency-cards 34, ui-tokens 30, db 14, i18n 11,
  rag-eval 10, catalog-builder 8, release-guards 6).
- rag-eval full: all thresholds; smoke: pass (CI runs the same subset).
- `./gradlew assembleRelease` with the release key and `-PskepiAllowDraftCards=true`: 49.5 MB, signing certificate
  SHA-256 `7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e`; without the flag the build fails.
- `connectedAndroidTest`, Maestro on the S23, parity, bench: above.
- GitHub Actions run 37397902353 (PR #1, `phase-1d`): `verify`, `rag-eval-smoke`, `android-release-guards` green.

## Deviations and open items

1. **Emergency cards are drafts.** Two certified first-aid instructors must review every card (and the Greek
   translation) before any public release; CODEOWNERS still lists only the maintainer.
2. **Battery costs were measured on USB power.** The E2E simulates a discharging battery at 25% (`dumpsys battery`)
   to drive the suggestion and the samples; the charge counter barely moves on a full, plugged S23, so the labels
   read "< 0.1% battery". Real per-action costs need an untethered run.
3. **GNSS indoors.** The S23 gets no fix indoors in airplane mode (the "No GPS fix yet" timeout path was verified).
   `run-e2e.ps1 -SimulateGnss` feeds the gps provider from a shell test provider (MOCK_LOCATION app-op granted to
   the shell for the flow and set back to deny afterwards). On the S23, test-provider positions stopped once the
   torch had been switched on, so `tools.yaml` takes the fix before the torch. A sky-view fix remains an owner test.
4. **Samsung Messages asks for the recipient first**; the flow takes no screenshot there (contacts are shown) and
   the runner checks the VIEW `sms:` intent in logcat instead.
5. **Held-out set used for a decision**; a fresh one is needed before release.
6. **Qwen3-1.7B (optional)** not evaluated.
7. **Maestro is not in CI** (E2E runs locally on the S23).
