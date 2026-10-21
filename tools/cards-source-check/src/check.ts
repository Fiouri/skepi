import type { EmergencyCard } from '@skepi/emergency-cards';

/**
 * The comparison is exact after a normalisation of whitespace, hyphenation and quotes only:
 * - whitespace: every run of Unicode whitespace or zero-width characters becomes one space (PDF text
 *   extraction breaks lines and pads with no-break and zero-width spaces);
 * - hyphenation: a soft hyphen is dropped; a hyphen at a line end joins the two lines, and each such
 *   break matches either with the hyphen ("life-threatening") or without it (a word split across lines);
 * - quotes: typographic single and double quotes become ' and ".
 * Nothing else is touched: letters, digits, dashes, punctuation and their order must match.
 */
const SPACES = /(?:\s|\u200b|\u200c|\u200d|\u2060|\ufeff)+/gu;
const SINGLE_QUOTES = /[\u2018\u2019\u201a\u201b]/gu;
const DOUBLE_QUOTES = /[\u201c\u201d\u201e\u201f]/gu;
const LINE_END_HYPHEN = /-[ \t\u00a0\u200b\ufeff]*\r?\n[\s\u200b\ufeff]*/gu;

function finish(text: string): string {
  return text.replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(SPACES, ' ').trim();
}

/** A step (or any text written on one line) in its comparable form. */
export function normalizeStep(text: string): string {
  return finish(text.replace(/\u00ad/gu, ''));
}

/** Stands for a hyphen at a line end in a normalised page: matches "-" or nothing. */
export const BREAK = '\u0001';

/** The comparable form of a page; every hyphenated line break becomes `BREAK`. */
export function normalizePage(text: string): string {
  return finish(text.replace(/\u00ad/gu, '').replace(LINE_END_HYPHEN, BREAK));
}

/** Whether `step` occurs in `page`, each `BREAK` matching either a hyphen or nothing. */
export function includesExcerpt(page: string, step: string): boolean {
  if (step.length === 0) return false;
  for (let start = 0; start < page.length; start += 1) {
    let p = start;
    let s = 0;
    while (s < step.length && p < page.length) {
      const c = page[p];
      if (c === BREAK) {
        if (step[s] === '-') s += 1;
        p += 1;
      } else if (c === step[s]) {
        p += 1;
        s += 1;
      } else {
        break;
      }
    }
    if (s === step.length) return true;
  }
  return false;
}

/** pdftotext output (`-enc UTF-8`): one form feed after every page. Index 0 = PDF page 1. */
export function splitPages(text: string): string[] {
  const pages = text.split('\f');
  if (pages.length > 1 && (pages[pages.length - 1] ?? '').trim() === '') pages.pop();
  return pages;
}

/**
 * The PDF page that carries a printed page number: the guidelines print "<n> |" (even pages) or
 * "| <n>" (odd pages) in the footer. The page at the same index is preferred; otherwise the first page
 * whose footer matches. Null when no page carries the number.
 */
export function pageIndexOf(pages: readonly string[], printed: number): number | null {
  const n = String(printed);
  const footer = new RegExp(`(?:^|\\s)${n} \\||\\| ${n}(?:\\s|$)`, 'u');
  const matches = (i: number): boolean => footer.test(normalizeStep(pages[i] ?? ''));
  if (printed >= 1 && printed <= pages.length && matches(printed - 1)) return printed - 1;
  for (let i = 0; i < pages.length; i += 1) if (matches(i)) return i;
  return null;
}

export interface StepResult {
  card: string;
  step: number;
  section: string;
  page: number;
  ok: boolean;
  problem: string | null;
}

/** Checks every step of every card against the extracted pages. */
export function checkCards(pages: readonly string[], cards: readonly EmergencyCard[]): StepResult[] {
  const normalized = new Map<number, string>();
  const pageText = (i: number): string => {
    let n = normalized.get(i);
    if (!n) {
      n = normalizePage(pages[i] ?? '');
      normalized.set(i, n);
    }
    return n;
  };
  const results: StepResult[] = [];
  for (const card of cards) {
    for (const [k, s] of card.steps.entries()) {
      const base = { card: card.id, step: k + 1, section: s.cite.section, page: s.cite.page };
      const index = pageIndexOf(pages, s.cite.page);
      if (index === null) {
        results.push({ ...base, ok: false, problem: `printed page ${String(s.cite.page)} not found in the PDF` });
        continue;
      }
      const step = normalizeStep(s.text);
      const ok = includesExcerpt(pageText(index), step);
      if (!ok) {
        results.push({ ...base, ok: false, problem: `not an exact excerpt of page ${String(s.cite.page)}` });
        continue;
      }
      const section = normalizeStep(s.cite.section);
      // The cited section must be named on the page or on one of the pages before it (topic heading).
      const named = [index, index - 1, index - 2, index - 3, index - 4, index - 5]
        .filter((i) => i >= 0)
        .some((i) => includesExcerpt(pageText(i), section));
      results.push({ ...base, ok: named, problem: named ? null : `section "${s.cite.section}" is not named on page ${String(s.cite.page)} or the 5 pages before it` });
    }
  }
  return results;
}
