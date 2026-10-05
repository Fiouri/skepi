# rag-eval (full) · 2026-10-04T22:15:19.278Z

Prompt `rag-v5-json-short` · model `qwen2.5-1.5b-instruct-q4_0.gguf` · CPU 8 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 84.8% | ≥ 0.9 | FAIL |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 1 | ≤ 0 | FAIL |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 108 | 84.7% | 63.3% | 123 | 82.1% | 0 | 100.0% | 60.0% | 0 | 0 | 141 / 325 | 1711 / 3159 |
| el | 50 | 82.2% | 37.8% | 22 | 95.5% | 0 | 100.0% | 60.0% | 0 | 0 | 112 / 233 | 2928 / 3251 |
| adversarial | 30 | 100.0% | 50.0% | 6 | 100.0% | 1 | 100.0% | 50.0% | 0 | 1 | 124 / 481 | 784 / 2371 |
| lang:en | 132 | 85.6% | 61.5% | 126 | 82.5% | 1 | 100.0% | 56.3% | 0 | 1 | 142 / 353 | 1677 / 3159 |
| lang:el | 56 | 83.0% | 40.4% | 25 | 96.0% | 0 | 100.0% | 57.1% | 0 | 0 | 110 / 233 | 2851 / 3251 |
| all | 188 | 84.8% | 55.0% | 151 | 84.8% | 1 | 100.0% | 56.5% | 0 | 1 | 129 / 308 | 1841 / 3221 |

Raw sentences removed by rule: not_covered 173, irrelevant 29, unsupported 29

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 193239 | 46777 | 0.242 | 1.11 |
| el | 40082 | 34404 | 0.858 | 0.94 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 256 | 191 | 74.6% | 87.2% |
| 0.4 | 256 | 191 | 74.6% | 87.2% |
| 0.5 | 256 | 191 | 74.6% | 87.2% |
| 0.6 | 256 | 191 | 74.6% | 87.2% |
| 0.7 | 256 | 191 | 74.6% | 87.2% |
| 0.8 | 256 | 191 | 74.6% | 87.2% |
| 0.9 | 245 | 183 | 74.7% | 83.6% |
| 1 | 234 | 175 | 74.8% | 79.9% |
