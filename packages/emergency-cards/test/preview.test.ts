import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as full from '../src/index';
import * as preview from '../src/preview';
import { previewCardsSource } from '../src/preview-source';

const generated = readFileSync(fileURLToPath(new URL('../src/preview-cards.generated.ts', import.meta.url)), 'utf8');

/** Every piece of advice text in the full cards (steps and "when to call for help", both languages). */
const adviceTexts = full.CARDS.flatMap((c) => Object.values(c.locales).flatMap((l) => [...l.steps, l.whenToCallForHelp]));

describe('Developer Preview cards', () => {
  it('the committed preview file is up to date (pnpm --filter @skepi/emergency-cards export-preview)', () => {
    expect(generated).toBe(previewCardsSource());
  });

  it('contain no step or "when to call for help" text', () => {
    expect(adviceTexts.length).toBeGreaterThan(50);
    for (const text of adviceTexts) expect(generated.includes(text)).toBe(false);
    for (const card of preview.CARDS) {
      expect(card.steps).toEqual([]);
      for (const l of Object.values(card.locales)) expect(l.steps.length + l.whenToCallForHelp.length).toBe(0);
    }
  });

  it('keep the same cards, titles, topics and search behaviour', () => {
    expect(preview.CARDS.map((c) => [c.id, c.locales.en.title, c.topics])).toEqual(full.CARDS.map((c) => [c.id, c.locales.en.title, c.topics]));
    for (const q of ['someone is choking', 'bad burn on the arm', 'earthquake shaking', 'how to purify water']) {
      expect(preview.cardsForQuestion(q, []).map((c) => c.id)).toEqual(full.cardsForQuestion(q, []).map((c) => c.id));
    }
    const card = preview.cardById('cpr');
    expect(card && preview.localizeCard(card, 'en')).toMatchObject({ title: full.cardById('cpr')?.locales.en.title, steps: [] });
  });

  it('export the same runtime API as the full entry (the bundler swaps one for the other)', () => {
    const names = (m: object): string[] => Object.keys(m).sort();
    // validateCards is for the release check of the full cards only.
    expect(names(preview)).toEqual(names(full).filter((n) => n !== 'validateCards'));
    expect(full.PREVIEW_BUILD).toBe(false);
    expect(preview.PREVIEW_BUILD).toBe(true);
  });
});
