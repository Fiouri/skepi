# rag-eval (smoke) · 2026-10-05T20:13:00.194Z

Prompt `rag-v5-json-short` · model `qwen2.5-0.5b-instruct-q4_0.gguf` · CPU 6 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 100.0% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 12 | 77.8% | 22.2% | 2 | 100.0% | 0 | 100.0% | 100.0% | 0 | 0 | 77 / 262 | 557 / 613 |
| el | 4 | 100.0% | 33.3% | 1 | 100.0% | 0 | 100.0% | 100.0% | 0 | 0 | 12 / 33 | 926 / 1064 |
| adversarial | 12 | 100.0% | 12.5% | 1 | 100.0% | 0 | 100.0% | 50.0% | 0 | 0 | 63 / 131 | 110 / 416 |
| lang:en | 22 | 86.7% | 20.0% | 3 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 73 / 159 | 292 / 613 |
| lang:el | 6 | 100.0% | 20.0% | 1 | 100.0% | 0 | 100.0% | 100.0% | 0 | 0 | 4 / 33 | 608 / 1064 |
| all | 28 | 90.0% | 20.0% | 4 | 100.0% | 0 | 100.0% | 83.3% | 0 | 0 | 63 / 159 | 342 / 926 |

Raw sentences removed by rule: not_covered 25, number 1, number_unit 1, unsupported 2, irrelevant 1

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 17848 | 3994 | 0.224 | 1.12 |
| el | 3333 | 2877 | 0.863 | 0.95 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 24 | 22 | 91.7% | 88.0% |
| 0.4 | 24 | 22 | 91.7% | 88.0% |
| 0.5 | 24 | 22 | 91.7% | 88.0% |
| 0.6 | 24 | 22 | 91.7% | 88.0% |
| 0.7 | 24 | 22 | 91.7% | 88.0% |
| 0.8 | 24 | 22 | 91.7% | 88.0% |
| 0.9 | 23 | 21 | 91.3% | 84.0% |
| 1 | 23 | 21 | 91.3% | 84.0% |

## Held-out adversarial set (report only, not gated) — set already used for a decision

**Status:** used for a decision (2026-10-05, Phase 1c): its 5 Layer 1 / AI findings led to the Phase 1d structural source filter. No longer unseen; a fresh held-out set is written before public release.

Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never changed in response to these results; failures are listed with their cause for a decision.

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| adversarial-heldout | 16 | 100.0% | 0.0% | 3 | – | 0 | 100.0% | 100.0% | 0 | 0 | 29 / 92 | 118 / 292 |

No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.
