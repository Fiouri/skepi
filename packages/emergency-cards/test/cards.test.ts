import { detectEmergency } from '@skepi/core';
import { describe, expect, it } from 'vitest';
import {
  CARD_DISPLAY_LOCALE,
  CARD_IDS,
  CARDS,
  cardById,
  cardsForQuestion,
  cardsForTopics,
  draftCards,
  findCards,
  localizeCard,
  SOURCES,
  validateCards,
  type EmergencyCard,
} from '../src';

describe('emergency cards', () => {
  it('are shown in English only until reviewed (Greek translation kept, not displayed)', () => {
    expect(CARD_DISPLAY_LOCALE).toBe('en');
  });

  it('bundles one card per required topic', () => {
    expect(CARDS.map((c) => c.id)).toEqual([...CARD_IDS]);
  });

  it('every card passes the structural checks', () => {
    expect(validateCards()).toEqual([]);
  });

  it('every step and every "when to call for help" cites a public-domain source with a locator', () => {
    const ids = new Set(SOURCES.map((s) => s.id));
    for (const card of CARDS) {
      for (const spec of [...card.steps, card.whenToCallForHelp]) {
        expect(spec.refs.length).toBeGreaterThan(0);
        for (const r of spec.refs) {
          expect(ids.has(r.source)).toBe(true);
          expect(r.locator.length).toBeGreaterThan(0);
        }
      }
    }
    for (const s of SOURCES) {
      expect(s.licence).toMatch(/^Public domain/);
      expect(new URL(s.url).hostname).toMatch(/\.(gov|mil)$/);
    }
  });

  it('cites no copyrighted guideline publisher', () => {
    const text = JSON.stringify(SOURCES).toLowerCase();
    for (const banned of ['european resuscitation council', 'american heart association', 'red cross', 'world health organization', 'erc.edu', 'heart.org', 'redcross', 'who.int']) {
      expect(text).not.toContain(banned);
    }
  });

  it('the Greek translation has the same steps as the English master', () => {
    for (const card of CARDS) expect(card.locales.el.steps.length).toBe(card.locales.en.steps.length);
  });

  it('ships every card as draft until first-aid professionals review it', () => {
    expect(draftCards().map((c) => c.id)).toEqual([...CARD_IDS]);
    for (const c of CARDS) expect(localizeCard(c, 'en').draft).toBe(true);
  });

  it('numbers in the Greek text match the English master', () => {
    const numbers = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')).sort();
    for (const card of CARDS) {
      card.locales.en.steps.forEach((en, i) => {
        expect(numbers(card.locales.el.steps[i] ?? ''), `${card.id} step ${String(i + 1)}`).toEqual(numbers(en));
      });
      expect(numbers(card.locales.el.whenToCallForHelp), `${card.id} call`).toEqual(numbers(card.locales.en.whenToCallForHelp));
    }
  });

  it('rejects a reviewed card without two reviewers and a date', () => {
    const base = cardById('cpr');
    if (!base) throw new Error('cpr missing');
    const bad: EmergencyCard = { ...base, review: { status: 'reviewed', reviewers: [{ name: 'A', qualification: 'x' }], date: null } };
    const problems = validateCards([bad, ...CARDS.filter((c) => c.id !== 'cpr')]).map((p) => p.problem);
    expect(problems).toContain('a reviewed card needs at least 2 reviewers (architecture: certified first-aid instructors)');
    expect(problems).toContain('a reviewed card needs a review date');
  });

  it('rejects a translation with a different number of steps', () => {
    const base = cardById('burns');
    if (!base) throw new Error('burns missing');
    const bad: EmergencyCard = { ...base, locales: { ...base.locales, el: { ...base.locales.el, steps: base.locales.el.steps.slice(1) } } };
    expect(validateCards([bad, ...CARDS.filter((c) => c.id !== 'burns')]).map((p) => p.problem)).toContain('el: 6 steps, master has 7');
  });
});

describe('cards for a question', () => {
  it.each([
    ['Someone is not breathing, how do I do CPR?', 'cpr'],
    ['My friend is bleeding heavily from the leg', 'bleeding'],
    ['What to do if a child is choking', 'choking'],
    ['How do I treat a burn from boiling water?', 'burns'],
    ['Signs of hypothermia', 'hypothermia'],
    ['What to do during an earthquake', 'earthquake'],
    ['Πώς κάνω ΚΑΡΠΑ;', 'cpr'],
    ['Τι κάνω σε σεισμό;', 'earthquake'],
    ['Έχει αιμορραγία στο χέρι', 'bleeding'],
  ])('%s → %s (intercept topics)', (q, id) => {
    const topics = detectEmergency(q)?.topics ?? [];
    expect(cardsForQuestion(q, topics).map((c) => c.id)).toContain(id);
  });

  it.each([
    ['How do I purify water to drink?', 'water-purification'],
    ['Πώς γίνεται το νερό πόσιμο; απολύμανση νερού', 'water-purification'],
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
    expect(cardsForTopics(['drowning']).map((c) => c.id)).toEqual(['cpr']);
  });

  it('localizes with resolved sources', () => {
    const card = cardById('flood');
    if (!card) throw new Error('flood missing');
    const el = localizeCard(card, 'el');
    expect(el.title).toBe('Πλημμύρα');
    expect(el.steps[0]?.refs[0]?.url).toBe('https://www.ready.gov/floods');
  });
});
