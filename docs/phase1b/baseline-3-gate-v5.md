# rag-eval (full) · 2026-10-04T22:45:13.922Z

Prompt `rag-v5-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 8 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 85.5% | ≥ 0.9 | FAIL |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 1 | ≤ 0 | FAIL |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 82.7% | 60.2% | 116 | 82.8% | 0 | 100.0% | 90.0% | 0 | 0 | 187 / 384 | 2487 / 4963 |
| el | 50 | 82.2% | 37.8% | 23 | 95.7% | 0 | 100.0% | 80.0% | 0 | 0 | 158 / 366 | 4296 / 4794 |
| adversarial | 30 | 100.0% | 50.0% | 6 | 100.0% | 1 | 100.0% | 75.0% | 0 | 1 | 213 / 847 | 1404 / 3347 |
| lang:en | 132 | 83.7% | 58.7% | 119 | 83.2% | 1 | 100.0% | 87.5% | 0 | 1 | 194 / 447 | 2442 / 4737 |
| lang:el | 56 | 83.0% | 40.4% | 26 | 96.2% | 0 | 100.0% | 71.4% | 0 | 0 | 156 / 366 | 4268 / 4794 |
| all | 188 | 83.4% | 53.0% | 145 | 85.5% | 1 | 100.0% | 82.6% | 0 | 1 | 178 / 384 | 2723 / 4794 |

Raw sentences removed by rule: not_covered 144, irrelevant 28, unsupported 29

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 177108 | 42975 | 0.243 | 1.11 |
| el | 39523 | 33917 | 0.858 | 0.94 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 242 | 183 | 75.6% | 87.1% |
| 0.4 | 242 | 183 | 75.6% | 87.1% |
| 0.5 | 242 | 183 | 75.6% | 87.1% |
| 0.6 | 242 | 183 | 75.6% | 87.1% |
| 0.7 | 242 | 183 | 75.6% | 87.1% |
| 0.8 | 242 | 183 | 75.6% | 87.1% |
| 0.9 | 232 | 176 | 75.9% | 83.8% |
| 1 | 222 | 169 | 76.1% | 80.5% |
