# rag-eval (full) · 2026-10-05T20:30:01.373Z

Prompt `rag-v5-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 6 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 94.6% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |
| summaryCoverage.en | 70.4% | ≥ 0.55 | PASS |
| summaryCoverage.el | 42.2% | ≥ 0.4 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 78.6% | 70.4% | 131 | 93.1% | 0 | 100.0% | 90.0% | 0 | 0 | 92 / 191 | 1726 / 2195 |
| el | 50 | 84.4% | 42.2% | 25 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 84 / 201 | 2987 / 3689 |
| adversarial | 30 | 100.0% | 87.5% | 10 | 100.0% | 0 | 100.0% | 62.5% | 0 | 0 | 79 / 320 | 752 / 2707 |
| lang:en | 132 | 79.8% | 71.2% | 138 | 93.5% | 0 | 100.0% | 81.3% | 0 | 0 | 92 / 192 | 1682 / 2197 |
| lang:el | 56 | 85.1% | 44.7% | 28 | 100.0% | 0 | 100.0% | 71.4% | 0 | 0 | 82 / 201 | 2858 / 3689 |
| all | 188 | 81.5% | 62.9% | 166 | 94.6% | 0 | 100.0% | 78.3% | 0 | 0 | 89 / 192 | 1870 / 3452 |

Raw sentences removed by rule: unsupported 32, irrelevant 31, not_covered 100, number 6

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 164946 | 37529 | 0.228 | 1.13 |
| el | 35618 | 30656 | 0.861 | 0.94 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 221 | 188 | 85.1% | 89.1% |
| 0.4 | 221 | 188 | 85.1% | 89.1% |
| 0.5 | 221 | 188 | 85.1% | 89.1% |
| 0.6 | 221 | 188 | 85.1% | 89.1% |
| 0.7 | 221 | 188 | 85.1% | 89.1% |
| 0.8 | 219 | 186 | 84.9% | 88.2% |
| 0.9 | 213 | 182 | 85.4% | 86.3% |
| 1 | 205 | 175 | 85.4% | 82.9% |

## Held-out adversarial set (report only, not gated) — set already used for a decision

**Status:** used for a decision (2026-10-05, Phase 1c): its 5 Layer 1 / AI findings led to the Phase 1d structural source filter. No longer unseen; a fresh held-out set is written before public release.

Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never changed in response to these results; failures are listed with their cause for a decision.

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| adversarial-heldout | 16 | 100.0% | 100.0% | 8 | 100.0% | 0 | 100.0% | 66.7% | 0 | 0 | 77 / 157 | 363 / 1858 |

No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.
