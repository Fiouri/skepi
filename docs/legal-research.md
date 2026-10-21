# Legal and store-policy research (2026-10-21)

Not legal advice; desk research from public sources, to inform owner decisions. Constraints set by the owner:
one app for every channel (no Play-only flavor), and no named individual medical reviewer is available.

## Findings

| Area | Finding | Impact on S.K.E.P.I. |
| --- | --- | --- |
| Google Play: account type | Play Console requirements: services that must register as an **Organization** (D-U-N-S) include "Health apps, such as Medical apps and Human Subjects Research apps". The Health apps declaration's **Medical** group lists "Emergency preparedness and first aid" and "Medical reference and patient education". | The app's core (emergency cards, numbers, first aid, WikiMed) falls under Medical. A personal account would require declaring "no health features", which would be inaccurate. **Play is blocked until an Organization account exists**; a trimmed Play build was rejected by the owner (two apps). |
| Google Play: Organization options | Organization needs a D-U-N-S number (free). Google's text frames Organization as commercial, professional or governmental activity; sole proprietors are not addressed on the help page. | Options: (a) owner registers as a sole proprietor (ελεύθερος επαγγελματίας) and obtains D-U-N-S, to be confirmed with Play; (b) an existing non-profit publishes the app under its account (e.g. a Greek FOSS association); (c) wait. |
| Google Play: Health Content and Services | Non-device health apps must carry "not a medical device and does not diagnose, treat, cure, or prevent any medical condition" in the description and remind users to consult a professional. | Already in the store texts (`docs/store-readiness.md`). |
| F-Droid | Inclusion Policy has no medical/health restriction. All assets need valid licences; non-commercial-licensed non-functional assets are tolerated if redistribution is allowed; undisclosed anti-features lead to rejection. | No legal blocker. If cards quote NC-licensed text, disclose it in the merge request (possible NonFreeAssets anti-feature). |
| EU MDR (2017/745), MDCG 2019-11 rev.1 | Qualification depends on the **intended purpose** in labelling, instructions and marketing. Software that informs diagnostic or therapeutic decisions for an individual is a medical device (Rule 11: class IIa, IIb or III by possible harm); storage, archiving and simple search of information are typically not. | Keep the app a general reference: static, generic content with citations; no individual-specific medical advice. The riskiest element is the AI summary on medical questions (currently opt-in). |
| EU Product Liability Directive (2024/2853) | Software is a product; strict liability incl. personal injury; transposition by 2026-12-09. Free and open-source software supplied outside a commercial activity is excluded; a price or payment in personal data brings it back in scope. | Stay non-commercial: no paid features, no ads, no data collection. |
| EU Cyber Resilience Act | Free and open-source software outside a commercial activity is out of scope (same logic as the PLD). | Same rule: stay non-commercial. |
| EU AI Act, Article 50 | From 2026-08-02: users must be told they are interacting with AI unless obvious; providers of systems generating synthetic text must mark output in a machine-readable way (existing systems: 2026-12-02). The open-source exemption (Art. 2(12)) does not cover Art. 50. | The AI summary is visibly labelled. Open item: whether machine-readable marking applies to on-device summaries and to AI text the user shares or exports; check the Commission's Art. 50 guidelines (2026-07-20). |
| Greek civil law (Αστικός Κώδικας 332) | An agreement excluding liability for intent or gross negligence is void. | The GPL warranty disclaimer does not cover gross negligence; content quality and safety rules still matter. |
| First-aid content sources | IFRC International First Aid, Resuscitation and Education Guidelines (2020; the 2025 edition is now used and carries the same terms): "Copies of all or part of this study may be made for non-commercial use, providing the source is acknowledged" (IFRC asks to be told how it is used). Hesperian (Where There Is No Doctor) needs written permission for any digital format. US Army FM 4-25.11 (2002) is public domain but dated and military-oriented. US federal agency pages (CDC, FEMA Ready.gov) are public domain; CDC terms: attribution ("Source: CDC"), a prominent no-endorsement disclaimer (CDC, HHS, U.S. Government), no change to substantive content, a statement that the material is available on the CDC website for no charge, no logos, check back for revisions; Ready.gov reprint terms: content not altered, no implied FEMA or U.S. Government endorsement. | **Done (2026-10-21):** cards quote the IFRC 2025 guidelines verbatim with citation instead of self-authored steps. Review moves to the source's international panel; the maintainer only checks that each excerpt matches the source. Requires an architecture decision (the "human-reviewed" rule). **Done (2026-10-21, second decision):** the four topics the IFRC does not cover for the public (water, earthquake, fire, flood) quote CDC and Ready.gov pages verbatim (US-specific passages left out), with citation (title, URL, retrieval date) and the no-endorsement statement on each card and in About; committed dated snapshots and a weekly drift check. |

## Changes (owner decision 2026-10-21, implemented; see PROGRESS.md c378aca)

1. Emergency cards: verbatim IFRC 2025 excerpts (8 cards, 61 steps) with citation and a "call 112 first" header; notify IFRC; licence notice in About; disclose the NC licence in the F-Droid MR. Second decision the same day: water purification (CDC), earthquake, fire and flood (FEMA Ready.gov) quoted verbatim from US federal public-domain pages (4 cards, 50 steps; 12 cards, 111 steps in all), with citation, no-endorsement statement and no logos; these four cards carry no anti-feature.
2. AI summary never runs on medical or emergency intent (remove the opt-in).
3. Intended-purpose statement (store texts, About, README): general reference and education; not a medical device; not for diagnosis or treatment.
4. Non-commercial rule recorded: no paid features, ads or data collection (keeps PLD/CRA exclusions).
5. AI Act Art. 50: confirm labelling and machine-readable marking for shared AI text.
6. Google Play stays deferred until an Organization account exists (one app on every channel).

## Sources

- Play Console requirements: https://support.google.com/googleplay/android-developer/answer/10788890
- Health apps declaration: https://support.google.com/googleplay/android-developer/answer/14738291
- Health Content and Services: https://support.google.com/googleplay/android-developer/answer/16679511
- Developer account types: https://support.google.com/googleplay/android-developer/answer/13634885
- F-Droid Inclusion Policy: https://f-droid.org/docs/Inclusion_Policy
- MDCG 2019-11 explained: https://openregulatory.com/mdcg/mdcg-2019-11
- PLD 2024/2853: https://eur-lex.europa.eu/eli/dir/2024/2853/en ; https://www.ibanet.org/European-Product-Liability-Directive-liability-for-software
- AI Act Art. 50: https://www.cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026
- IFRC guidelines 2020: https://www.ifrc.org/document/international-first-aid-resuscitation-and-education-guidelines
- CDC use of agency materials: https://www.cdc.gov/other/agencymaterials.html
- CDC, How to Make Water Safe in an Emergency: https://www.cdc.gov/water-emergency/about/index.html
- Ready.gov reprint terms of use (Free Publications): https://www.ready.gov/publications
- Ready.gov hazard pages: https://www.ready.gov/earthquakes ; https://www.ready.gov/home-fires ; https://www.ready.gov/wildfires ; https://www.ready.gov/floods
- Hesperian open copyright: https://hesperian.org/?p=37720
