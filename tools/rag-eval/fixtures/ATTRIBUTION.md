# Eval fixture ZIMs: licences and attribution

## eval-smoke-en.zim, eval-smoke-el.zim

Text of the Wikipedia articles listed below, copied (lead sections, images and scripts removed) from the Kiwix packs named here. Built by `scripts/build_eval_zims.py`, which verifies each pack's SHA-256 against `scripts/content.lock.json` first.

- Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The fixture ZIMs are distributed under the same licence.
- Attribution: Wikipedia contributors. Each article's authors are listed in its page history on Wikipedia (e.g. `https://en.wikipedia.org/w/index.php?title=Canberra&action=history`).
- Changes: only the lead section that the Kiwix *mini* flavour contains; markup reduced to text, headings and lists.

### en: from `wikipedia_en_top_mini_2026-09.zim` (sha256 `9e75b5f03b4ff61864772d811bd9715c9cdc27a429229abb779aaa3cc3aa8e05`, https://download.kiwix.org/zim/wikipedia/wikipedia_en_top_mini_2026-09.zim)

- [Canberra](https://en.wikipedia.org/wiki/Canberra)
- [Australian Capital Territory](https://en.wikipedia.org/wiki/Australian_Capital_Territory)
- [Australia](https://en.wikipedia.org/wiki/Australia)
- [Sydney](https://en.wikipedia.org/wiki/Sydney)
- [Earthquake](https://en.wikipedia.org/wiki/Earthquake)
- [Plate tectonics](https://en.wikipedia.org/wiki/Plate_tectonics)
- [Seismology](https://en.wikipedia.org/wiki/Seismology)
- [Mount Everest](https://en.wikipedia.org/wiki/Mount_Everest)
- [Himalayas](https://en.wikipedia.org/wiki/Himalayas)
- [Great Barrier Reef](https://en.wikipedia.org/wiki/Great_Barrier_Reef)
- [Coral reef](https://en.wikipedia.org/wiki/Coral_reef)
- [Queensland](https://en.wikipedia.org/wiki/Queensland)
- [Eiffel Tower](https://en.wikipedia.org/wiki/Eiffel_Tower)
- [Paris](https://en.wikipedia.org/wiki/Paris)
- [Neil Armstrong](https://en.wikipedia.org/wiki/Neil_Armstrong)
- [Apollo 11](https://en.wikipedia.org/wiki/Apollo_11)
- [Moon](https://en.wikipedia.org/wiki/Moon)
- [Dehydration](https://en.wikipedia.org/wiki/Dehydration)
- [Oral rehydration therapy](https://en.wikipedia.org/wiki/Oral_rehydration_therapy)
- [Cholera](https://en.wikipedia.org/wiki/Cholera)
- [Diarrhea](https://en.wikipedia.org/wiki/Diarrhea)
- [Water purification](https://en.wikipedia.org/wiki/Water_purification)
- [Boiling](https://en.wikipedia.org/wiki/Boiling)
- [Albert Einstein](https://en.wikipedia.org/wiki/Albert_Einstein)
- [Penicillin](https://en.wikipedia.org/wiki/Penicillin)
- [Alexander Fleming](https://en.wikipedia.org/wiki/Alexander_Fleming)
- [Ibuprofen](https://en.wikipedia.org/wiki/Ibuprofen)
- [Dog](https://en.wikipedia.org/wiki/Dog)
- [Wi-Fi](https://en.wikipedia.org/wiki/Wi-Fi)
- [FIFA World Cup](https://en.wikipedia.org/wiki/FIFA_World_Cup)
- [Laptop](https://en.wikipedia.org/wiki/Laptop)
- [Personal identification number](https://en.wikipedia.org/wiki/Personal_identification_number)
- [Debit card](https://en.wikipedia.org/wiki/Debit_card)
- [Snakebite](https://en.wikipedia.org/wiki/Snakebite)
- [Rabies](https://en.wikipedia.org/wiki/Rabies)

### en: from `wikipedia_en_medicine_mini_2026-04.zim` (sha256 `55153075b0773ea9c04a3db295ec5898129434ab5cae087dcb7822f37a81f358`, https://download.kiwix.org/zim/wikipedia/wikipedia_en_medicine_mini_2026-04.zim)

- [Portable water purification](https://en.wikipedia.org/wiki/Portable_water_purification)

### el: from `wikipedia_el_top_mini_2026-07.zim` (sha256 `369118ef0737561ef5624cc56546b52e6c2c244193b0e1c23a8cd58896044571`, https://download.kiwix.org/zim/wikipedia/wikipedia_el_top_mini_2026-07.zim)

- [Πάτρα](https://el.wikipedia.org/wiki/Πάτρα)
- [Περιφερειακή Ενότητα Αχαΐας](https://el.wikipedia.org/wiki/Περιφερειακή_Ενότητα_Αχαΐας)
- [Πελοπόννησος](https://el.wikipedia.org/wiki/Πελοπόννησος)
- [Σεισμός](https://el.wikipedia.org/wiki/Σεισμός)
- [Σεισμολογία](https://el.wikipedia.org/wiki/Σεισμολογία)
- [Αριστοτέλης](https://el.wikipedia.org/wiki/Αριστοτέλης)
- [Πλάτων](https://el.wikipedia.org/wiki/Πλάτων)
- [Αθήνα](https://el.wikipedia.org/wiki/Αθήνα)
- [Παγκόσμιο Κύπελλο Ποδοσφαίρου](https://el.wikipedia.org/wiki/Παγκόσμιο_Κύπελλο_Ποδοσφαίρου)
- [Ηφαίστειο](https://el.wikipedia.org/wiki/Ηφαίστειο)

## eval-synthetic.zim

Invented articles written by the SKEPI project for the adversarial set (`fixtures/synthetic-articles.json`). They contain deliberate prompt-injection text and false claims and are not real facts. Licence: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Never shipped in the app.

## eval-heldout.zim

Held-out invented articles written by the SKEPI project for `sets/adversarial-heldout.json` (`fixtures/heldout-articles.json`), independently of the source sanitizer and its lexicon. They contain deliberate prompt-injection text and false claims and are not real facts. Licence: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Never shipped in the app; never used to tune prompts, lexicons or thresholds.
