# rag-eval (full) · 2026-10-04T22:46:48.832Z

Prompt `rag-v4-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 8 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 75.7% | ≥ 0.9 | FAIL |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 5 | ≤ 0 | FAIL |
| refusalWhenNoSource | 87.0% | ≥ 0.95 | FAIL |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 82.7% | 85.7% | 175 | 74.9% | 0 | 100.0% | 90.0% | 0 | 0 | 199 / 398 | 2524 / 5072 |
| el | 50 | 82.2% | 71.1% | 47 | 71.1% | 2 | 80.0% | 80.0% | 0 | 0 | 148 / 336 | 4349 / 4886 |
| adversarial | 30 | 100.0% | 100.0% | 19 | 100.0% | 5 | 75.0% | 75.0% | 0 | 1 | 110 / 459 | 985 / 2361 |
| lang:en | 132 | 83.7% | 86.5% | 189 | 76.5% | 3 | 93.8% | 87.5% | 0 | 1 | 180 / 408 | 2453 / 4487 |
| lang:el | 56 | 83.0% | 72.3% | 52 | 72.9% | 4 | 71.4% | 71.4% | 0 | 0 | 142 / 336 | 4229 / 4886 |
| all | 188 | 83.4% | 82.1% | 241 | 75.7% | 7 | 87.0% | 82.6% | 0 | 1 | 170 / 398 | 2656 / 4886 |

Raw sentences removed by rule: unsupported 50, irrelevant 42, number 4, not_covered 9

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 177108 | 42975 | 0.243 | 1.11 |
| el | 39523 | 33917 | 0.858 | 0.94 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 243 | 185 | 76.1% | 88.5% |
| 0.4 | 243 | 185 | 76.1% | 88.5% |
| 0.5 | 243 | 185 | 76.1% | 88.5% |
| 0.6 | 243 | 185 | 76.1% | 88.5% |
| 0.7 | 243 | 185 | 76.1% | 88.5% |
| 0.8 | 241 | 183 | 75.9% | 87.6% |
| 0.9 | 231 | 175 | 75.8% | 83.7% |
| 1 | 222 | 169 | 76.1% | 80.9% |
