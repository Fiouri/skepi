# @skepi/emergency-cards

Emergency cards and per-country emergency numbers, bundled in the app and available from the first
second after install. Cards never pass through the LLM.

## Rules (owner decision 2026-10-21)

- **Source:** every step is a verbatim excerpt (whole sentences) with its citation (`src/cards.ts`,
  `src/sources.ts`): first aid from the IFRC International First Aid, Resuscitation and Education
  Guidelines, latest edition (2025; section and printed page); water purification (CDC), earthquake,
  fire and flood (FEMA Ready.gov) from US federal public-domain pages (heading, URL, retrieval date;
  second decision of 2026-10-21). The source's own step numbers are not part of the excerpt. No
  paraphrase, no excerpts merged into new sentences, no quote edited to localise it (US-specific
  passages such as 911, US agencies and FEMA programmes are left out), no LLM-written text.
- **Licence of the card text:** "Copies of all or part of this study may be made for non-commercial use,
  providing the source is acknowledged." (© International Federation of Red Cross and Red Crescent
  Societies, Geneva, 2025). Each card shows its citation; About lists the IFRC attribution
  (`IFRC_ATTRIBUTION`). Non-commercial use only (`CONTRIBUTING.md`). CDC and Ready.gov text is public
  domain under the agencies' reuse terms: attribution ("Source: CDC", "Source: FEMA, Ready.gov"), the
  no-endorsement statement on every card from them (`CDC_DISCLAIMER`, `FEMA_DISCLAIMER`) and in About,
  content not altered, no logos.
- **Unsourced topics** (no suitable verbatim passage) would be listed in `src/unsourced.ts`, which the
  package entry never imports, so no bundle contains them. None since the CDC / Ready.gov decision.
- **Card layout:** "Call <number> first" header (the country's general number, 112 in the EU), the
  numbered steps, the citation line. Steps are English in every locale; the Greek locale keeps Greek
  titles and search words only.
- **CODEOWNERS:** every change to this folder needs a reviewer listed in `.github/CODEOWNERS`.

## Checks

- `tools/cards-source-check` downloads the PDF from the pinned URL (`src/sources.ts`), checks its
  SHA-256, extracts the text with `pdftotext` and fails unless every step is an exact substring of the
  cited page after a normalisation of whitespace, hyphenation and quotes only. CDC / Ready.gov steps
  are checked against the committed snapshots (`tools/cards-source-check/snapshots/`, pinned by their
  text hash in `src/sources.ts`): an exact substring of one block under the cited heading. `snapshot
  <id>` refreshes a snapshot; `drift` (weekly CI) compares the snapshots with the live pages. `--write-lock` writes
  `source-check.lock.json` (the digest of exactly the checked steps); CI runs it without the flag and
  fails when the lock does not match.
- `scripts/check-release.ts` runs in every release build (Android `skepiCheckEmergencyCards`, iOS build
  phase): structure (every step cited) and the lock digest. CI proves it fails on an altered step.
- `tools/release-guards` `cards-bundle` scans the built bundles: no unsourced card text (the 199 former
  texts), every sourced step present (short steps such as "Access EMS." as an exact whole string: a Hermes
  string-table entry or a JavaScript string literal), and sourced steps only with a matching lock.

## Emergency numbers

`src/numbers.ts`: EU member states, Switzerland, the UK, the US, Canada, Australia and New Zealand,
each with the official page it was checked against. Greece: 112, EKAB 166, Fire 199, Police 100,
Coast Guard 108, Poison Centre 210 779 3777. Any other country gets 112 as a default, labelled
"check the local number". The country is chosen at onboarding; the app never promises that a call
works without a SIM card or network.
