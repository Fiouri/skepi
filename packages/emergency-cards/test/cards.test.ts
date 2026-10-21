import { detectEmergency } from '@skepi/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARD_DISPLAY_LOCALE,
  CARD_IDS,
  CARDS,
  cardById,
  cardsForQuestion,
  cardsForTopics,
  CDC_DISCLAIMER,
  citationLine,
  FEMA_DISCLAIMER,
  findCards,
  IFRC_ATTRIBUTION,
  IFRC_GUIDELINES,
  localizeCard,
  SOURCES,
  WEB_SOURCES,
  validateCards,
  type EmergencyCard,
} from '../src';
import { cardsDigest, expectedLock, lockProblem, readLock } from '../src/digest';
import * as preview from '../src/preview';
import { UNSOURCED_TOPICS } from '../src/unsourced';

describe('emergency cards', () => {
  it('are shown in English (source text; the steps are never translated)', () => {
    expect(CARD_DISPLAY_LOCALE).toBe('en');
  });

  it('bundles one card per sourced topic', () => {
    expect(CARDS.map((c) => c.id)).toEqual([...CARD_IDS]);
  });

  it('every card passes the structural checks', () => {
    expect(validateCards()).toEqual([]);
  });

  it('every step cites a section and a printed page of the IFRC guidelines 2025, or a heading of a CDC / Ready.gov page', () => {
    expect(IFRC_GUIDELINES.edition).toBe('2025');
    expect(new URL(IFRC_GUIDELINES.url).hostname).toBe('www.ifrc.org');
    expect(IFRC_GUIDELINES.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const w of WEB_SOURCES) {
      expect(['www.cdc.gov', 'www.ready.gov']).toContain(new URL(w.url).hostname);
      expect(w.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(w.textSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(w.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const bySource = new Map<string, string[]>();
    for (const card of CARDS) {
      for (const s of card.steps) {
        expect(s.cite.section.length).toBeGreaterThan(0);
        if (SOURCES[s.cite.source].kind === 'pdf') expect(s.cite.page).toBeGreaterThan(100);
        else expect(s.cite.page).toBeNull();
        bySource.set(card.id, [...new Set([...(bySource.get(card.id) ?? []), s.cite.source])]);
      }
    }
    expect(Object.fromEntries(bySource)).toEqual({
      cpr: ['ifrc-2025'],
      bleeding: ['ifrc-2025'],
      choking: ['ifrc-2025'],
      burns: ['ifrc-2025'],
      fractures: ['ifrc-2025'],
      hypothermia: ['ifrc-2025'],
      heatstroke: ['ifrc-2025'],
      poisoning: ['ifrc-2025'],
      fire: ['ready-home-fires', 'ready-wildfires'],
      earthquake: ['ready-earthquakes'],
      flood: ['ready-floods'],
      'water-purification': ['cdc-water'],
    });
  });

  it('never quotes a US-specific passage (911, US agencies or programmes)', () => {
    for (const card of CARDS) {
      for (const s of card.steps) expect(s.text).not.toMatch(/9-?1-?1|FEMA|NOAA|\bEAS\b|NFIP|National Weather Service|United States|U\.S\./u);
    }
  });

  it('attributes the IFRC with the licence statement printed in the source', () => {
    expect(IFRC_ATTRIBUTION).toContain('Copies of all or part of this study may be made for non-commercial use, providing the source is acknowledged.');
    expect(IFRC_ATTRIBUTION).toContain('International Federation of Red Cross and Red Crescent Societies');
  });

  it('has no unsourced topic left, and the package entry never imports the unsourced list', () => {
    expect(UNSOURCED_TOPICS).toEqual([]);
    // The package entry never imports the unsourced list (so no bundle contains it).
    for (const file of ['index.ts', 'api.ts', 'cards.ts', 'preview.ts']) {
      expect(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')).not.toContain('unsourced');
    }
  });

  it('the committed source-check lock matches the cards (tools/cards-source-check passed for them)', () => {
    expect(lockProblem()).toBeNull();
    expect(readLock()).toEqual(expectedLock());
  });

  it('any change to a step, a citation or the source invalidates the lock', () => {
    const base = cardById('burns');
    if (!base) throw new Error('burns missing');
    const reworded: EmergencyCard = { ...base, steps: base.steps.map((s, i) => (i === 0 ? { ...s, text: `${s.text} ` } : s)) };
    const moved: EmergencyCard = { ...base, steps: base.steps.map((s, i) => (i === 0 ? { ...s, cite: { ...s.cite, page: (s.cite.page ?? 0) + 1 } } : s)) };
    const others = CARDS.filter((c) => c.id !== 'burns');
    expect(cardsDigest([reworded, ...others])).not.toBe(cardsDigest([base, ...others]));
    expect(cardsDigest([moved, ...others])).not.toBe(cardsDigest([base, ...others]));
    expect(lockProblem([reworded, ...others])).toBe('the card steps differ from the last passed cards-source-check');
  });

  it('rejects steps with a source step number, extra whitespace or no citation', () => {
    const base = cardById('cpr');
    if (!base) throw new Error('cpr missing');
    const first = base.steps[0];
    if (!first) throw new Error('cpr step missing');
    const bad: EmergencyCard = {
      ...base,
      steps: [
        { ...first, text: `1. ${first.text}` },
        { ...first, text: `${first.text}  Again.` },
        { text: first.text, cite: { source: 'ifrc-2025', section: '', page: 0 } },
        { text: first.text, cite: { source: 'ready-floods', section: 'During a Flood', page: 12 } },
      ],
    };
    const problems = validateCards([bad, ...CARDS.filter((c) => c.id !== 'cpr')]).map((p) => p.problem);
    expect(problems).toContain('step 1: starts with a source step number');
    expect(problems).toContain('step 2: whitespace must be single spaces');
    expect(problems).toContain('step 3: no cited section');
    expect(problems).toContain('step 3: invalid cited page 0');
    expect(problems).toContain('step 4: a web source has no page');
  });

  it('builds one citation line per card (edition, sections, pages)', () => {
    const cpr = cardById('cpr');
    const bleeding = cardById('bleeding');
    if (!cpr || !bleeding) throw new Error('card missing');
    expect(citationLine(cpr)).toBe(
      'Source: IFRC International First Aid, Resuscitation and Education Guidelines 2025, “Unresponsive and abnormal breathing (adolescent and adult)”, pp. 161–162.',
    );
    expect(citationLine(bleeding)).toBe('Source: IFRC International First Aid, Resuscitation and Education Guidelines 2025, “Severe bleeding”, pp. 257–258.');
    expect(localizeCard(bleeding, 'en').citation).toBe(citationLine(bleeding));
    expect(localizeCard(bleeding, 'en').disclaimer).toBeNull();
  });

  it('cites web pages with attribution, title, URL and retrieval date, and shows the no-endorsement statement', () => {
    const water = cardById('water-purification');
    const fire = cardById('fire');
    if (!water || !fire) throw new Error('card missing');
    expect(citationLine(water)).toBe(
      'Source: CDC. “How to Make Water Safe in an Emergency”, https://www.cdc.gov/water-emergency/about/index.html, retrieved 2026-10-21.',
    );
    expect(citationLine(fire)).toBe(
      'Source: FEMA, Ready.gov. “Home Fires”, https://www.ready.gov/home-fires, retrieved 2026-10-21; “Wildfires”, https://www.ready.gov/wildfires, retrieved 2026-10-21.',
    );
    expect(localizeCard(water, 'en').disclaimer).toBe(CDC_DISCLAIMER);
    expect(localizeCard(fire, 'en').disclaimer).toBe(FEMA_DISCLAIMER);
    expect(CDC_DISCLAIMER).toContain('does not imply endorsement by CDC, HHS or the United States Government');
    expect(CDC_DISCLAIMER).toContain('available on the CDC website for no charge');
    expect(FEMA_DISCLAIMER).toContain('does not imply that the Federal Emergency Management Agency or the U.S. Government endorses');
  });

  it('the Developer Preview entry ships the same cards with the preview label on', () => {
    expect(preview.PREVIEW_BUILD).toBe(true);
    expect(preview.CARDS).toBe(CARDS);
  });
});

describe('cards for a question', () => {
  it.each([
    ['Someone is not breathing, how do I do CPR?', 'cpr'],
    ['My friend is bleeding heavily from the leg', 'bleeding'],
    ['What to do if a child is choking', 'choking'],
    ['How do I treat a burn from boiling water?', 'burns'],
    ['Signs of hypothermia', 'hypothermia'],
    ['Πώς κάνω ΚΑΡΠΑ;', 'cpr'],
    ['Έχει αιμορραγία στο χέρι', 'bleeding'],
  ])('%s → %s (intercept topics)', (q, id) => {
    const topics = detectEmergency(q)?.topics ?? [];
    expect(cardsForQuestion(q, topics).map((c) => c.id)).toContain(id);
  });

  it.each([
    ['Is a broken arm serious?', 'fractures'],
    ['symptoms of heat exhaustion', 'heatstroke'],
  ])('%s → %s (keywords)', (q, id) => {
    expect(findCards(q).map((c) => c.id)).toContain(id);
  });

  it.each(['How do I clean a firearm?', 'What is the capital of Australia?', 'Who wrote the Iliad?', 'Η Πάτρα είναι πόλη της Ελλάδας'])(
    'no card for %s',
    (q) => {
      expect(cardsForQuestion(q, detectEmergency(q)?.topics ?? [])).toEqual([]);
    },
  );

  it('maps intercept topics to cards', () => {
    expect(cardsForTopics(['fire', 'burn']).map((c) => c.id)).toEqual(['burns', 'fire']);
    expect(cardsForTopics(['earthquake']).map((c) => c.id)).toEqual(['earthquake']);
    expect(cardsForTopics(['flood']).map((c) => c.id)).toEqual(['flood']);
    expect(cardsForTopics(['drowning']).map((c) => c.id)).toEqual(['cpr']);
  });

  it.each([
    ['What to do during an earthquake', 'earthquake'],
    ['Τι κάνω σε σεισμό;', 'earthquake'],
    ['How do I purify water to drink?', 'water-purification'],
    ['The river is flooding the street', 'flood'],
    ['There is a wildfire near the village', 'fire'],
  ])('%s → %s (disaster cards)', (q, id) => {
    expect(cardsForQuestion(q, detectEmergency(q)?.topics ?? []).map((c) => c.id)).toContain(id);
  });

  it('localizes titles; steps stay the English IFRC text', () => {
    const card = cardById('burns');
    if (!card) throw new Error('burns missing');
    const el = localizeCard(card, 'el');
    expect(el.title).toBe('Εγκαύματα');
    expect(el.steps).toBe(card.steps);
  });
});
