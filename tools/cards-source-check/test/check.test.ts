import type { EmergencyCard } from '@skepi/emergency-cards';
import { describe, expect, it } from 'vitest';
import { BREAK, checkCards, includesExcerpt, normalizePage, normalizeStep, pageIndexOf, splitPages } from '../src/check';

// Three pages as pdftotext prints them: footers "<n> |" / "| <n>", line breaks, zero-width spaces,
// typographic quotes and a word hyphenated across a line.
const PDF_TEXT = [
  'Front matter\n\n\u2699\ufe0f \u200b\n1\u200b |\u200b\n',
  'Severe bleeding\nFirst aid steps 1.\u200b Ask the person to apply direct pressure to their\ninjury with their hands. 2.\u200b Help the person to lie down.\nApply a life-\nthreatening tourni-\nquet only to a limb. Ask: \u201cAre you alright?\u201d The person\u2019s arm.\n\nFIRST AID\u200b |\u200b\n\n2\n',
  'Burns\nCool the burn with clean running water for at least 10 minutes.\n\u2699\ufe0f \u200b\n3\u200b |\u200b\n',
  '',
].join('\f');

const card = (steps: { text: string; section: string; page: number }[]): EmergencyCard => ({
  id: 'bleeding',
  topics: ['bleeding'],
  steps: steps.map((s) => ({ text: s.text, cite: { section: s.section, page: s.page } })),
  labels: { en: { title: 't', keywords: ['k'] }, el: { title: 't', keywords: ['k'] } },
});

describe('normalisation (whitespace, hyphenation, quotes only)', () => {
  it('collapses whitespace and zero-width characters, maps typographic quotes', () => {
    expect(normalizeStep('  a\u200b\u00a0 b\n\u201cc\u201d \u2018d\u2019 ')).toBe('a b "c" \'d\'');
  });

  it('marks a hyphenated line break (hyphen or nothing) and drops soft hyphens', () => {
    const softHyphen = String.fromCharCode(0xad);
    const page = normalizePage(`a life-\nthreatening tourni-\nquet in${softHyphen}jury`);
    expect(page).toBe(`a life${BREAK}threatening tourni${BREAK}quet injury`);
    expect(includesExcerpt(page, 'a life-threatening tourniquet injury')).toBe(true);
    expect(includesExcerpt(page, 'lifethreatening tourni-quet')).toBe(true);
    expect(includesExcerpt(page, 'life threatening')).toBe(false);
  });

  it('keeps dashes, digits and punctuation as they are', () => {
    expect(normalizeStep('100\u2013120 compressions; 30:2.')).toBe('100\u2013120 compressions; 30:2.');
  });
});

describe('pages', () => {
  const pages = splitPages(PDF_TEXT);

  it('splits pdftotext output on form feeds', () => {
    expect(pages).toHaveLength(3);
  });

  it('finds a printed page number in the footer', () => {
    expect(pageIndexOf(pages, 2)).toBe(1);
    expect(pageIndexOf(pages, 3)).toBe(2);
    expect(pageIndexOf(pages, 9)).toBeNull();
  });
});

describe('checkCards', () => {
  const pages = splitPages(PDF_TEXT);
  const run = (text: string, page = 2, section = 'Severe bleeding') => checkCards(pages, [card([{ text, section, page }])])[0];

  it('accepts verbatim excerpts across line breaks, with typographic quotes', () => {
    expect(run('Ask the person to apply direct pressure to their injury with their hands.')?.ok).toBe(true);
    expect(run('Ask: \u201cAre you alright?\u201d The person\u2019s arm.')?.ok).toBe(true);
    expect(run('Ask: "Are you alright?" The person\'s arm.')?.ok).toBe(true);
  });

  it('accepts a hyphenated line break in either form', () => {
    expect(run('Apply a life-threatening tourniquet only to a limb.')?.ok).toBe(true);
  });

  it('rejects a paraphrase, a merged sentence and a changed number', () => {
    expect(run('Ask the person to press on their injury with their hands.')?.problem).toBe('not an exact excerpt of page 2');
    expect(run('Ask the person to apply direct pressure to their injury with their hands and lie down.')?.ok).toBe(false);
    expect(run('Cool the burn with clean running water for at least 20 minutes.', 3, 'Burns')?.ok).toBe(false);
  });

  it('rejects text from another page than the cited one', () => {
    expect(run('Cool the burn with clean running water for at least 10 minutes.', 2, 'Burns')?.ok).toBe(false);
    expect(run('Cool the burn with clean running water for at least 10 minutes.', 3, 'Burns')?.ok).toBe(true);
  });

  it('rejects a page that does not exist and a section that is not named', () => {
    expect(run('Help the person to lie down.', 9)?.problem).toBe('printed page 9 not found in the PDF');
    expect(run('Help the person to lie down.', 2, 'Choking')?.ok).toBe(false);
  });
});
