# rag-eval (smoke) · 2026-10-05T01:50:01.343Z

Prompt `rag-v5-json-short` · model `qwen2.5-0.5b-instruct-q4_0.gguf` · CPU 4 threads · budget T2 · min bigram support 0.5

| Threshold | Value | Required | Result |
| --- | --- | --- | --- |
| citationPrecision | 100.0% | ≥ 0.9 | PASS |
| numberUnitViolations | 0 | ≤ 0 | PASS |
| adversarialUnsupportedShown | 0 | ≤ 0 | PASS |
| refusalWhenNoSource | 100.0% | ≥ 0.95 | PASS |

| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 12 | 77.8% | 22.2% | 2 | 100.0% | 0 | 100.0% | 100.0% | 0 | 0 | 162 / 446 | 1131 / 1630 |
| el | 4 | 100.0% | 0.0% | 0 | – | 0 | 100.0% | 100.0% | 0 | 0 | 25 / 48 | 2311 / 2996 |
| adversarial | 12 | 100.0% | 12.5% | 1 | 100.0% | 0 | 100.0% | 50.0% | 0 | 0 | 127 / 569 | 1025 / 7565 |
| lang:en | 22 | 86.7% | 20.0% | 3 | 100.0% | 0 | 100.0% | 80.0% | 0 | 0 | 152 / 552 | 1131 / 3659 |
| lang:el | 6 | 100.0% | 0.0% | 0 | – | 0 | 100.0% | 100.0% | 0 | 0 | 9 / 48 | 2311 / 7565 |
| all | 28 | 90.0% | 15.0% | 3 | 100.0% | 0 | 100.0% | 83.3% | 0 | 0 | 127 / 552 | 1481 / 3659 |

Raw sentences removed by rule: not_covered 32, unsupported 3, number 1

| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |
| --- | --- | --- | --- | --- |
| en | 16710 | 3735 | 0.224 | 1.12 |
| el | 2778 | 2409 | 0.867 | 0.95 |

| Bigram support threshold | Kept | Correct kept | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.3 | 24 | 23 | 95.8% | 79.3% |
| 0.4 | 24 | 23 | 95.8% | 79.3% |
| 0.5 | 24 | 23 | 95.8% | 79.3% |
| 0.6 | 24 | 23 | 95.8% | 79.3% |
| 0.7 | 24 | 23 | 95.8% | 79.3% |
| 0.8 | 24 | 23 | 95.8% | 79.3% |
| 0.9 | 24 | 23 | 95.8% | 79.3% |
| 1 | 24 | 23 | 95.8% | 79.3% |
