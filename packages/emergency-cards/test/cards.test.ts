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
  citationLine,
  findCards,
  IFRC_ATTRIBUTION,
  IFRC_GUIDELINES,
  localizeCard,
  validateCards,
  type EmergencyCard,
} from '../src';
import { cardsDigest, expectedLock, lockProblem, readLock } from '../src/digest';
import * as preview from '../src/preview';
import { UNSOURCED_TOPICS } from '../src/unsourced';

describe('emergency cards', () => {
  it('are shown in English (IFRC text; the steps are never translated)', () => {
    expect(CARD_DISPLAY_LOCALE).toBe('en');
  });

  it('bundles one card per sourced topic', () => {
    expect(CARDS.map((c) => c.id)).toEqual([...CARD_IDS]);
  });

  it('every card passes the structural checks', () => {
    expect(validateCards()).toEqual([]);
  });

  it('every step cites a section and a printed page of the IFRC guidelines 2025', () => {
    expect(IFRC_GUIDELINES.edition).toBe('2025');
    expect(new URL(IFRC_GUIDELINES.url).hostname).toBe('www.ifrc.org');
    expect(IFRC_GUIDELINES.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const card of CARDS) {
      for (const s of card.steps) {
        expect(s.cite.section.length).toBeGreaterThan(0);
        expect(s.cite.page).toBeGreaterThan(100);
      }
    }
  });

  it('attributes the IFRC with the licence statement printed in the source', () => {
    expect(IFRC_ATTRIBUTION).toContain('Copies of all or part of this study may be made for non-commercial use, providing the source is acknowledged.');
    expect(IFRC_ATTRIBUTION).toContain('International Federation of Red Cross and Red Crescent Societies');
  });

  it('keeps unsourced topics out of the bundled cards, with no advice text', () => {
    const ids = new Set<string>(CARDS.map((c) => c.id));
    expect(UNSOURCED_TOPICS.map((t) => t.id)).toEqual(['water-purification', 'earthquake', 'fire', 'flood']);
    for (const t of UNSOURCED_TOPICS) {
      expect(ids.has(t.id)).toBe(false);
      expect(Object.keys(t).sort()).toEqual(['id', 'reason', 'title']);
    }
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
    const moved: EmergencyCard = { ...base, steps: base.steps.map((s, i) => (i === 0 ? { ...s, cite: { ...s.cite, page: s.cite.page + 1 } } : s)) };
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
        { text: first.text, cite: { section: '', page: 0 } },
      ],
    };
    const problems = validateCards([bad, ...CARDS.filter((c) => c.id !== 'cpr')]).map((p) => p.problem);
    expect(problems).toContain('step 1: starts with a source step number');
    expect(problems).toContain('step 2: whitespace must be single spaces');
    expect(problems).toContain('step 3: no cited section');
    expect(problems).toContain('step 3: invalid cited page 0');
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
    expect(cardsForTopics(['fire', 'burn']).map((c) => c.id)).toEqual(['burns']);
    expect(cardsForTopics(['drowning']).map((c) => c.id)).toEqual(['cpr']);
  });

  it('no card for unsourced topics (the emergency number and Layer 1 only)', () => {
    for (const q of ['What to do during an earthquake', 'How do I purify water to drink?', 'Τι κάνω σε σεισμό;']) {
      expect(cardsForQuestion(q, detectEmergency(q)?.topics ?? [])).toEqual([]);
    }
  });

  it('localizes titles; steps stay the English IFRC text', () => {
    const card = cardById('burns');
    if (!card) throw new Error('burns missing');
    const el = localizeCard(card, 'el');
    expect(el.title).toBe('Εγκαύματα');
    expect(el.steps).toBe(card.steps);
  });
});
