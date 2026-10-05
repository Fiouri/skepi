# @skepi/emergency-cards

Static, sourced emergency cards and per-country emergency numbers, bundled in the app and available
from the first second after install. Cards never pass through the LLM.

## Rules

- **Sources:** public-domain material only (US federal government works: Army ATP 4-02.11, FEMA /
  Ready.gov, USFA, CDC, NHLBI, EPA). No copyrighted guidelines (ERC, AHA, WHO, Red Cross texts).
  Every step cites its source with a locator (paragraph, page or section) in `src/cards/*.ts`; the
  sources are listed in `src/sources.ts` with the date they were checked.
- **Languages:** English is the master; the Greek translation has the same steps in the same order
  (a test also checks that every number matches).
- **Review:** every card ships as `draft` until at least two certified first-aid instructors review
  it (`review: { status: 'reviewed', reviewers, date }`). Draft cards show a permanent "Draft — not
  reviewed by first-aid professionals" banner.
- **Release gate:** `scripts/check-release.ts` runs in every Android release build
  (`skepiCheckEmergencyCards`). It fails on any draft card unless the build passes
  `-PskepiAllowDraftCards=true`, which is for internal testing builds only and prints a loud warning.
- **CODEOWNERS:** every change to this folder needs a reviewer listed in `.github/CODEOWNERS`.

## Emergency numbers

`src/numbers.ts`: EU member states, Switzerland, the UK, the US, Canada, Australia and New Zealand,
each with the official page it was checked against. Greece: 112, EKAB 166, Fire 199, Police 100,
Coast Guard 108, Poison Centre 210 779 3777. Any other country gets 112 as a default, labelled
"check the local number". The country is chosen at onboarding; the app never promises that a call
works without a SIM card or network.
