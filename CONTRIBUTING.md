# Contributing to SKEPI

Thank you for helping. SKEPI is a Developer Preview: issues, tests on other devices and focused pull
requests are all useful.

## Before you start

- Read [`docs/architecture.md`](docs/architecture.md) (the source of truth) and
  [`docs/threat-model.md`](docs/threat-model.md). Security problems go to [SECURITY.md](SECURITY.md),
  never to a public issue.
- English only until v1 (code, comments, commits, UI strings; the Greek locale is frozen).
- Problems with an answer: use "Report a problem with this answer" in the app, copy the text into an
  issue and add what you expected. The text contains only the question, what was shown, the cited
  sources and the app version.

## Ground rules

- **Offline first.** No analytics, telemetry, ads or remote calls. Network code lives only in the
  ContentStore (downloads) and the local P2P / Station modules; ESLint enforces it in the apps.
- **Emergency cards** change only with review by certified first-aid professionals (two reviewers,
  recorded in the card); every step cites a public-domain or official source.
- **AI safety rules are not tuned against held-out sets.** The rag-eval held-out adversarial sets are
  report-only; prompts, the sanitizer, lexicons and thresholds change only by an explicit maintainer
  decision recorded in the phase report (see `tools/rag-eval/README.md`).
- Dependencies: pinned versions; native artefacts pinned by SHA-256 (`native/*`, `scripts/content.lock.json`).
- TypeScript strict, no `any`; Rust with `clippy -D warnings`; conventional commits in English.

## Checks

```sh
pnpm install
pnpm verify                       # typecheck + lint + unit tests
cargo fmt --all -- --check        # desktop crates (on Windows through scripts/with-msvc.ps1)
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Answer quality: `pnpm --filter @skepi/rag-eval eval` (full, needs the provisioned packs and model) or
`--smoke`. Android E2E: `e2e/run-e2e.ps1` (Maestro, airplane mode). Desktop: `pnpm --filter
@skepi/desktop e2e` (Playwright, mocked native side) and `apps/desktop/e2e/tauri-smoke.mjs` (real build).
A pull request should keep CI green and say which device it was tested on.

## Licence

By contributing you agree that your contribution is licensed under GPL-3.0-or-later (code) and, for
emergency-card text, CC BY-SA 4.0, like the rest of the project.
