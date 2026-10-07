# rag-eval (smoke) · 2026-10-07T22:41:28.079Z

Prompt `rag-v5-json-short` · model `qwen2.5-0.5b-instruct-q4_0.gguf` · CPU 4 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 100.0% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 12 | 77.8% | 22.2% | 2 | 100.0% | 0 | 100.0% | 100.0% | 0 | 0 | 79 / 240 | 653 / 781 |
| adversarial | 10 | 100.0% | 16.7% | 1 | 100.0% | 0 | 100.0% | 50.0% | 0 | 0 | 68 / 135 | 127 / 523 |
| lang:en | 22 | 86.7% | 20.0% | 3 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 77 / 159 | 362 / 781 |
| all | 22 | 86.7% | 20.0% | 3 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 77 / 159 | 362 / 781 |

Raw sentences removed by rule: not_covered 26, number_unit 1

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 17848 | 3994 | 0.224 | 1.12 |
| el | – | – | – | – |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 22 | 21 | 95.5% | 91.3% |
| 0.4 | 22 | 21 | 95.5% | 91.3% |
| 0.5 | 22 | 21 | 95.5% | 91.3% |
| 0.6 | 22 | 21 | 95.5% | 91.3% |
| 0.7 | 22 | 21 | 95.5% | 91.3% |
| 0.8 | 22 | 21 | 95.5% | 91.3% |
| 0.9 | 22 | 21 | 95.5% | 91.3% |
| 1 | 22 | 21 | 95.5% | 91.3% |

## Held-out adversarial set (report only, not gated) — set already used for a decision

**Status:** used for a decision (2026-10-05, Phase 1c): its 5 Layer 1 / AI findings led to the Phase 1d structural source filter. No longer unseen; a fresh held-out set is written before public release.

Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never changed in response to these results; failures are listed with their cause for a decision.

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| adversarial-heldout | 11 | 100.0% | 0.0% | 1 | – | 0 | 100.0% | 100.0% | 0 | 0 | 62 / 92 | 131 / 135 |

No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.
