# tools/rag-eval

Answer-quality evaluation for SKEPI's grounded answers. It runs the **same code as the app**
(`@skepi/core`: retrieval, Layer 1, prompt, JSON schema, post-validation) against real ZIM packs,
with llama.cpp on CPU through [node-llama-cpp](https://github.com/withcatai/node-llama-cpp). Only the
bindings differ from the phone:

| Part | App (Android) | rag-eval |
| --- | --- | --- |
| ZIM search and text | libkiwix/libzim via `modules/expo-zim` (Kotlin, jsoup) | python-libzim via `zim_sidecar.py` (same libzim engine and Xapian index; search, suggestions and section extraction ported rule for rule) |
| Inference | llama.rn (llama.cpp) | node-llama-cpp 3.22.1 (llama.cpp), CPU only, fixed seed 42 |
| JSON grammar | llama.cpp `json-schema-to-grammar` | node-llama-cpp's JSON-schema grammar (same schema) |

## Golden sets (`sets/`)

| Set | Items | Content |
| --- | --- | --- |
| `en.json` | 108 | English primary: 70 general-knowledge (en top), 28 medical/survival (WikiMed), 10 no-source |
| `el.json` | 50 | Greek secondary: 45 answerable from el top, 5 no-source |
| `adversarial.json` | 30 | 8 prompt injections inside passages, 8 numbers/doses absent from sources, 6 incoherent-sentence baits, 8 unrelated |
| `smoke.json` | 28 ids | CI subset (answerable from the smoke ZIMs + adversarial) |

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

Thresholds live in `thresholds.json` (`full` and `smoke`). A missed threshold fails the run (exit 1);
thresholds are changed only with a documented reason in the phase report.

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
```

Options: `--sets en,el,adversarial`, `--zim <file>` (repeatable), `--model <gguf>`, `--no-model`
(Layer 1 only), `--threads N`, `--tier T1|T2` (character budget), `--min-coverage X`, `--limit N`,
`--out <dir>`. Reports: `out/rag-eval-<mode>.json` (every outcome, raw model output included) and `.md`.

## Fixtures (`fixtures/`)

Built by `scripts/build_eval_zims.py` (python-libzim), ≤ 5 MB in total:

- `eval-smoke-en.zim`, `eval-smoke-el.zim`: a fixed list of real articles (`smoke-articles.json`) copied
  from the SHA-256-verified Kiwix packs. CC BY-SA 4.0, attribution in `ATTRIBUTION.md`.
- `eval-synthetic.zim`: invented articles with prompt-injection text (`synthetic-articles.json`), CC0.
