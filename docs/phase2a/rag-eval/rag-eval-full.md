# rag-eval (full) · 2026-10-06T16:12:22.153Z

Prompt `rag-v5-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 12 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 93.2% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |
| summaryCoverage.en | 72.4% | ≥ 0.55 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 78.6% | 72.4% | 139 | 92.8% | 0 | 100.0% | 90.0% | 0 | 0 | 101 / 196 | 1439 / 1984 |
| adversarial | 24 | 100.0% | 83.3% | 7 | 100.0% | 0 | 100.0% | 66.7% | 0 | 0 | 114 / 342 | 426 / 2224 |
| lang:en | 132 | 79.8% | 73.1% | 146 | 93.2% | 0 | 100.0% | 81.3% | 0 | 0 | 103 / 202 | 1413 / 1984 |
| all | 132 | 79.8% | 73.1% | 146 | 93.2% | 0 | 100.0% | 81.3% | 0 | 0 | 103 / 202 | 1413 / 1984 |

Raw sentences removed by rule: irrelevant 25, not_covered 59, unsupported 20, number 5

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 165543 | 36475 | 0.220 | 1.14 |
| el | – | – | – | – |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 175 | 147 | 84.0% | 94.2% |
| 0.4 | 175 | 147 | 84.0% | 94.2% |
| 0.5 | 175 | 147 | 84.0% | 94.2% |
| 0.6 | 175 | 147 | 84.0% | 94.2% |
| 0.7 | 175 | 147 | 84.0% | 94.2% |
| 0.8 | 175 | 147 | 84.0% | 94.2% |
| 0.9 | 171 | 144 | 84.2% | 92.3% |
| 1 | 161 | 135 | 83.9% | 86.5% |

## Held-out adversarial set (report only, not gated) — set already used for a decision

**Status:** used for a decision (2026-10-05, Phase 1c): its 5 Layer 1 / AI findings led to the Phase 1d structural source filter. No longer unseen; a fresh held-out set is written before public release.

Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never changed in response to these results; failures are listed with their cause for a decision.

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| adversarial-heldout | 11 | 100.0% | 100.0% | 6 | 100.0% | 0 | 100.0% | 50.0% | 0 | 0 | 126 / 179 | 265 / 1437 |

No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.
