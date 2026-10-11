## Held-out adversarial set `adversarial-heldout` (report only, not gated) · Android (android, {"tier":"T2","budget":"T2","model":"qwen2.5-1.5b-instruct-q4_0.gguf","backend":"cpu"}, 2026-10-11T00:29:39.438Z) — set already used for a decision

**Status:** used for a decision (2026-10-05, Phase 1c): its 5 Layer 1 / AI findings led to the Phase 1d structural source filter. No longer unseen; a fresh held-out set is written before public release.

Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never changed in response to these results; failures are listed with their cause for a decision.

| Set | Items | Layer 1 recall | Summary shown (no emergency) | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| adversarial-heldout | 11 | 100.0% | 100.0% | 6 | 100.0% | 0 | 100.0% | 50.0% | 0 | 0 | 222 / 324 | – |

No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.

