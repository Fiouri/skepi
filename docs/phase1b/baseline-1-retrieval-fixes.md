# rag-eval (full) · 2026-10-04T21:51:43.364Z

Prompt `rag-v4-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 8 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 70.7% | ≥ 0.9 | FAIL |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 1 | ≤ 0 | FAIL |
| refusalWhenNoSource | 87.0% | ≥ 0.95 | FAIL |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 82.7% | 80.6% | 159 | 72.2% | 1 | 90.0% | 80.0% | 0 | 0 | 111 / 245 | 1721 / 2878 |
| el | 50 | 82.2% | 66.7% | 41 | 59.0% | 2 | 80.0% | 80.0% | 0 | 0 | 92 / 655 | 2981 / 3447 |
| adversarial | 30 | 100.0% | 75.0% | 12 | 90.9% | 1 | 87.5% | 75.0% | 0 | 0 | 112 / 463 | 1720 / 3434 |
| lang:en | 132 | 83.7% | 79.8% | 167 | 73.5% | 1 | 93.8% | 81.3% | 0 | 0 | 114 / 273 | 1721 / 2832 |
| lang:el | 56 | 83.0% | 68.1% | 45 | 59.5% | 3 | 71.4% | 71.4% | 0 | 0 | 90 / 655 | 2965 / 3447 |
| all | 188 | 83.4% | 76.2% | 212 | 70.7% | 4 | 87.0% | 78.3% | 0 | 0 | 104 / 281 | 1953 / 3430 |

Raw sentences removed by rule: unsupported 64, irrelevant 54, number 9, not_covered 16

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 187320 | 44722 | 0.239 | 1.33 |
| el | 41662 | 35370 | 0.849 | 1.00 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 218 | 155 | 71.1% | 84.7% |
| 0.4 | 218 | 155 | 71.1% | 84.7% |
| 0.5 | 218 | 155 | 71.1% | 84.7% |
| 0.6 | 218 | 155 | 71.1% | 84.7% |
| 0.7 | 218 | 155 | 71.1% | 84.7% |
| 0.8 | 217 | 155 | 71.4% | 84.7% |
| 0.9 | 212 | 151 | 71.2% | 82.5% |
| 1 | 207 | 148 | 71.5% | 80.9% |
