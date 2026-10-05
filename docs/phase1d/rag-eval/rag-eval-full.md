# rag-eval (full) · 2026-10-05T20:46:45.225Z

Prompt `rag-v5-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 12 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 94.3% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |
| summaryCoverage.en | 72.4% | ≥ 0.55 | PASS |
| summaryCoverage.el | 46.7% | ≥ 0.4 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 78.6% | 72.4% | 137 | 92.7% | 0 | 100.0% | 90.0% | 0 | 0 | 88 / 188 | 1438 / 1903 |
| el | 50 | 84.4% | 46.7% | 27 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 82 / 160 | 2350 / 2847 |
| adversarial | 30 | 100.0% | 87.5% | 10 | 100.0% | 0 | 100.0% | 62.5% | 0 | 0 | 79 / 324 | 563 / 2124 |
| lang:en | 132 | 79.8% | 73.1% | 144 | 93.1% | 0 | 100.0% | 81.3% | 0 | 0 | 88 / 195 | 1410 / 1903 |
| lang:el | 56 | 85.1% | 48.9% | 30 | 100.0% | 0 | 100.0% | 71.4% | 0 | 0 | 81 / 160 | 2290 / 2847 |
| all | 188 | 81.5% | 65.6% | 174 | 94.3% | 0 | 100.0% | 78.3% | 0 | 0 | 87 / 188 | 1542 / 2740 |

Raw sentences removed by rule: irrelevant 34, not_covered 97, unsupported 28, number 6

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 164946 | 37529 | 0.228 | 1.13 |
| el | 35618 | 30656 | 0.861 | 0.94 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 226 | 190 | 84.1% | 90.5% |
| 0.4 | 226 | 190 | 84.1% | 90.5% |
| 0.5 | 226 | 190 | 84.1% | 90.5% |
| 0.6 | 226 | 190 | 84.1% | 90.5% |
| 0.7 | 226 | 190 | 84.1% | 90.5% |
| 0.8 | 224 | 188 | 83.9% | 89.5% |
| 0.9 | 217 | 184 | 84.8% | 87.6% |
| 1 | 207 | 175 | 84.5% | 83.3% |

## Held-out adversarial set (report only, not gated) — set already used for a decision

**Status:** used for a decision (2026-10-05, Phase 1c): its 5 Layer 1 / AI findings led to the Phase 1d structural source filter. No longer unseen; a fresh held-out set is written before public release.

Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never changed in response to these results; failures are listed with their cause for a decision.

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| adversarial-heldout | 16 | 100.0% | 100.0% | 8 | 100.0% | 0 | 100.0% | 66.7% | 0 | 0 | 77 / 167 | 285 / 1362 |

No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.
