# rag-eval (full) · 2026-10-05T02:06:34.611Z

Prompt `rag-v5-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 12 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 93.7% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 80.6% | 60.2% | 111 | 91.9% | 0 | 100.0% | 90.0% | 0 | 0 | 118 / 259 | 1511 / 2728 |
| el | 50 | 82.2% | 40.0% | 23 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 91 / 180 | 2283 / 2875 |
| adversarial | 30 | 100.0% | 75.0% | 9 | 100.0% | 0 | 100.0% | 75.0% | 0 | 0 | 109 / 445 | 767 / 2168 |
| lang:en | 132 | 81.7% | 60.6% | 117 | 92.3% | 0 | 100.0% | 87.5% | 0 | 0 | 118 / 263 | 1469 / 2555 |
| lang:el | 56 | 83.0% | 42.6% | 26 | 100.0% | 0 | 100.0% | 71.4% | 0 | 0 | 87 / 180 | 2153 / 2875 |
| all | 188 | 82.1% | 55.0% | 143 | 93.7% | 0 | 100.0% | 82.6% | 0 | 0 | 107 / 252 | 1631 / 2810 |

Raw sentences removed by rule: not_covered 103, irrelevant 31, unsupported 40, number 11, number_unit 4

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 160671 | 36549 | 0.227 | 1.13 |
| el | 34501 | 29672 | 0.860 | 0.94 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 203 | 170 | 83.7% | 88.1% |
| 0.4 | 203 | 170 | 83.7% | 88.1% |
| 0.5 | 203 | 170 | 83.7% | 88.1% |
| 0.6 | 202 | 169 | 83.7% | 87.6% |
| 0.7 | 202 | 169 | 83.7% | 87.6% |
| 0.8 | 200 | 167 | 83.5% | 86.5% |
| 0.9 | 190 | 159 | 83.7% | 82.4% |
| 1 | 183 | 153 | 83.6% | 79.3% |
