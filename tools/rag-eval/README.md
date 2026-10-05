# tools/rag-eval

Answer-quality evaluation for SKEPI's grounded answers. It runs the **same code as the app**
(`@skepi/core`: retrieval, Layer 1, prompt, JSON schema, post-validation) against real ZIM packs,
with llama.cpp on CPU through [node-llama-cpp](https://github.com/withcatai/node-llama-cpp). Only the
bindings differ from the phone:

| Part | App (Android) | rag-eval |
| --- | --- | --- |
| ZIM search and text | libkiwix/libzim via `modules/expo-zim` (Kotlin, jsoup) | python-libzim 3.10.0 (libzim 9.7.0, the AAR's version) via `zim_sidecar.py` (same Xapian index; search, suggestions and section extraction ported rule for rule, incl. jsoup's spacing at `<br>` and block elements; archive ids are the ZIM UUIDs, as on the phone) |
| Inference | llama.rn (llama.cpp) | node-llama-cpp 3.22.1 (llama.cpp), CPU only, fixed seed 42 |
| JSON grammar | llama.cpp `json-schema-to-grammar` | node-llama-cpp's JSON-schema grammar (same schema) |

## Golden sets (`sets/`)

| Set | Items | Content |
| --- | --- | --- |
| `en.json` | 108 | English primary: 70 general-knowledge (en top), 28 medical/survival (WikiMed), 10 no-source |
| `el.json` | 50 | Greek secondary: 45 answerable from el top, 5 no-source |
| `adversarial.json` | 30 | 8 prompt injections inside passages, 8 numbers/doses absent from sources, 6 incoherent-sentence baits, 8 unrelated |
| `adversarial-heldout.json` | 16 | **Held-out** (report only): 10 injections (9 in `eval-heldout.zim`), 3 no-source, 2 absent numbers, 1 bait |
| `smoke.json` | 28 ids + held-out set | CI subset (answerable from the smoke ZIMs + adversarial) and the whole held-out set |

Each item: question, language, expected outcome (`answer` / `no_source` / `any`), expected source
article(s), optional forbidden strings or term groups. `--check-sets` verifies that every expected
article exists in the packs (labels are fixed when a title is a redirect, never to make an answer pass).

## Metrics

- **Citation precision**: shown AI sentences whose cited source is one of the item's expected articles.
- **Unsupported sentences shown**: shown sentences that fail an *independent* oracle (≥ 60% of their
  content words in the cited source), contain forbidden content, or appear on a no-source item.
- **Refusal when no source**: no-source items where no AI sentence is shown (retrieval stopped, or
  the model declined, or validation removed everything).
- **Number/unit violations**: shown sentences with a number+unit that is not verbatim in the cited source.
- **Tokens per character** per language with the model's real tokenizer, and the core estimator's ratio.
- **CPU latency** (Layer 1, TTFT, generation), informational; phone numbers come from the bench.
- **Bigram-support sweep**: precision/recall of the support threshold over all raw model sentences.

- **Summary coverage** per language: answer items of the `en` / `el` set with at least one shown AI
  sentence. No-regression floor from the Phase 1b baseline (en ≥ 0.55, el ≥ 0.40), full runs only (the
  smoke model is too small to measure it).

Thresholds live in `thresholds.json` (`full` and `smoke`) and apply to the gated sets (`en`, `el`,
`adversarial`). A missed threshold fails the run (exit 1); thresholds are changed only with a documented
reason in the phase report.

## Held-out adversarial set: rule

`sets/adversarial-heldout.json` and `fixtures/heldout-articles.json` were written independently of the
source sanitizer, its lexicon and the tuned adversarial set. They measure how the defences generalise,
so they must stay unseen by tuning:

- **Do not change the sanitizer lexicon, the prompts or any threshold in response to held-out results.**
- The set runs in every full and smoke run, in its own report section ("Held-out adversarial set"), and
  is never part of the pooled metrics or the gated thresholds.
- Its items see the packs plus `eval-heldout.zim`; the other sets never see that archive.
- Failures are reported with their cause (sanitizer missed the injected sentence, validator kept a
  sentence, retrieval passed the no-source gate, forbidden text left in a Layer 1 passage) for an
  explicit decision by the maintainer, recorded in the phase report. A fix that follows such a decision
  is validated on the tuned sets; the held-out set is then replaced or extended with new unseen items.

## Running

```powershell
# once: Python deps for the sidecar and the fixture builder
python -m venv .venv; .venv\Scripts\python -m pip install -r tools/rag-eval/requirements.txt
$env:SKEPI_PYTHON = "$PWD\.venv\Scripts\python.exe"

# packs and models (SHA-256 verified) into %TEMP%\skepi\cache
powershell -ExecutionPolicy Bypass -File scripts/provision.ps1 -DownloadOnly

pnpm --filter @skepi/rag-eval eval -- --check-sets   # dataset hygiene
pnpm --filter @skepi/rag-eval eval                   # full: en + el packs, Qwen2.5-1.5B Q4_0
pnpm --filter @skepi/rag-eval eval:smoke             # CI subset: fixture ZIMs, Qwen2.5-0.5B Q4_0
powershell -File e2e/run-parity.ps1                  # device/eval retrieval parity (phone connected)
```

## Device/eval retrieval parity

`src/parity.ts` + `e2e/run-parity.ps1`: the en and el questions go through `retrieve()` only (no LLM) on
the phone (Bench → "Run retrieval parity", `@skepi/core` `probeRetrieval`) and here, recording every step:
each search list (per archive), the fused hits, a hash of every extracted article text, the 12 best
chunks with scores, and the chosen sources (chunk ids). Any difference fails with the first diverging
step per question (`out/parity.md`). Phase 1c root causes: fusion used the position in the concatenated
multi-archive list (archive order differs per engine) instead of the rank inside each archive, and
BeautifulSoup joined text at `<br>` where jsoup puts a space.

Options: `--sets en,el,adversarial`, `--zim <file>` (repeatable), `--model <gguf>`, `--no-model`
(Layer 1 only), `--threads N`, `--tier T1|T2` (character budget), `--min-coverage X`, `--limit N`,
`--out <dir>`. Reports: `out/rag-eval-<mode>.json` (every outcome, raw model output included) and `.md`.

## Fixtures (`fixtures/`)

Built by `scripts/build_eval_zims.py` (python-libzim), ≤ 5 MB in total:

- `eval-smoke-en.zim`, `eval-smoke-el.zim`: a fixed list of real articles (`smoke-articles.json`) copied
  from the SHA-256-verified Kiwix packs. CC BY-SA 4.0, attribution in `ATTRIBUTION.md`.
- `eval-synthetic.zim`: invented articles with prompt-injection text (`synthetic-articles.json`), CC0.
- `eval-heldout.zim`: held-out invented articles with prompt-injection text (`heldout-articles.json`), CC0.
