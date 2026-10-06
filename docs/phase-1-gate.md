# Phase 1 gate · Android MVP (English-first)

Date: 2026-10-06 · Reference device: Galaxy S23 (SM-S911B, Android 16, 8 GB, **T2**) · Build: release
`org.skepi.app` (release key, R8; draft emergency cards allowed with `-PskepiAllowDraftCards=true` for this
internal build) · Phase reports: [1a](phase1a/README.md), [1b](phase-1b-report.md), [1c](phase-1c-report.md),
[1d](phase-1d-report.md).

The gate in `docs/architecture.md` (Roadmap → Phase 1): *Maestro in airplane mode green · zero egress ·
viewer sealing tests green · rag-eval above threshold · Layer 1 < 1 s and sources < 2 s (T1-simulation) ·
first token < 15 s on T2 · T1 measured if a device is available.*

## Gate items

| Gate item | Target | Measured (Phase 1d) | Result |
| --- | --- | --- | --- |
| Maestro E2E in airplane mode | all flows green | 8/8 offline flows on the S23 (tools, onboarding, ask-en, ask-t1, medical, cards, blackout, Greek UI) — [`phase1d/e2e/`](phase1d/e2e/) | ✓ |
| Zero egress (offline flows) | 0 requests, 0 bytes | ContentStore requests **0**, blocked WebView requests **0**, bytes of the app UID on real interfaces **0** | ✓ |
| Zero egress (download flow) | mirror only, 0 bytes on real interfaces | onboarding with downloads + catalog/download/import flows: all requests to the local mirror, no query strings, generic User-Agent, **0** bytes on real interfaces | ✓ |
| Viewer sealing tests | green | `SealingTest` **12/12** (incl. the blackout CSS test); all instrumentation 21/21 ([`phase1d/instrumentation/`](phase1d/instrumentation/)) | ✓ |
| rag-eval thresholds | precision ≥ 90%, 0 number/unit violations, 0 adversarial unsupported, refusal ≥ 95%, coverage en ≥ 0.55 / el ≥ 0.40 | precision **94.3%**, violations **0**, adversarial unsupported **0**, refusal **100%**, coverage en **72.4%** / el **46.7%** ([report](phase1d/rag-eval/rag-eval-full.md)) | ✓ |
| Layer 1, T1-simulation | p95 < 1 s | en **258 ms**, el **265 ms** | ✓ |
| Sources visible, T1-simulation | p95 < 2 s | en **193 ms**, el **290 ms** | ✓ |
| First AI token on T2 | p95 < 15 s (English) | **4.7 s** (normal mode, English) | ✓ |
| T1 measured on a real 4 GB device | if available | **pending** — no 4 GB device; T1-simulation on the S23 only | pending |

## Performance targets (`docs/architecture.md`, "Performance, energy and blackout mode")

All T1 targets are **pending a real 4 GB device**; the S23 values below are T2 (normal) and T1-simulation.

| Metric | Target (T1) | S23 normal (T2) | S23 T1-simulation | Status |
| --- | --- | --- | --- | --- |
| Cold start to search, no model | < 2 s | not measured | not measured | pending (no measurement yet) |
| Title suggestions p95 | < 50 ms | 18 ms | 40 ms | ✓ on S23 · T1 pending |
| Full-text search p95 | < 300 ms | 16 ms | 28 ms | ✓ on S23 · T1 pending |
| Article open (HTML) p95 | < 500 ms | 10 ms | 9 ms | ✓ on S23 · T1 pending |
| Layer 1 p95 (en / el) | < 1 s | 398 / 311 ms | 258 / 265 ms | ✓ on S23 · T1 pending |
| Sources visible p95 (en / el) | < 2 s | 234 / 325 ms | 193 / 290 ms | ✓ on S23 · T1 pending |
| First AI token p95 (en / el) | < 15 s on T2; T1 set after measurement | 4.7 / 27.0 s¹ | 5.9 / 13.4 s | T2 English ✓ · T1 pending |
| Model load (warm) | < 10 s | 0.6 s | 0.8 s | ✓ on S23 · T1 pending |
| APK per ABI (arm64) | < 80 MB | 49.5 MB | — | ✓ |

¹ Greek first-token p95 in normal mode is one outlier of 27 s among six questions (p50 8.9 s; Phase 1c 9.6 s);
the < 15 s gate is defined for English. Raw: [`phase1d/bench/`](phase1d/bench/).

## Phase 1 scope (Roadmap)

| Item | Status |
| --- | --- |
| Release keystore outside the repo, fail-closed signing | done (1a) |
| Two-layer answers, char budgets, Q4_0, KV reuse; GPU/NPU experiment | done (1b) |
| Citation hardening (bigram support, number/unit rule, adversarial set, medical flow) | done (1b) |
| Viewer sealing instrumentation tests | done (1a; blackout CSS test added in 1d) |
| Signed catalog and downloads; English defaults + Greek locale packs | done (1c; public hosting later) |
| Structural source filter; fresh held-out set before public release | filter done (1d); fresh held-out set **open** |
| Emergency cards (English + Greek), onboarding, blackout mode, T1-simulation | done (1d; cards are **drafts** until reviewed) |
| rag-eval (English primary, Greek secondary, tokens/char), CI smoke | done (1b–1d) |
| Maestro in CI | **open** (E2E runs locally on the S23; CI builds the release APK and runs the release guards) |

## Open before the public release (not Phase 1 blockers)

- Emergency cards reviewed by at least two certified first-aid instructors (release builds fail with drafts).
- A fresh, unseen held-out adversarial set (the current one was used for the Phase 1d decision).
- T1 targets on a real 4 GB Android device.
- Battery-cost numbers from an untethered run (E2E ran on USB power; the measurement path is verified).
- GNSS fix with a sky view (E2E indoors used a shell test provider; the timeout path was verified indoors).
