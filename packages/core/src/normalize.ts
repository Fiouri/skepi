/**
 * Detection forms of source text (post-preview hardening). Structural and lexicon checks look at a
 * normalised copy; the text shown to the reader stays exactly as in the source.
 *
 * 1. NFKC per code point: full-width, mathematical, circled and ligature forms become plain letters
 *    ("𝐒𝐘𝐒𝐓𝐄𝐌", "ＳＹＳＴＥＭ" → "SYSTEM").
 * 2. Format characters (Unicode category Cf: zero-width space/joiners, word joiner, soft hyphen, BOM,
 *    bidirectional controls) are dropped, so they cannot split a word or a marker.
 * 3. Confusable folding (letters only, after Unicode TR39 confusables): a word that mixes Latin, Greek
 *    and Cyrillic letters is folded to one script, and a word written entirely in Cyrillic or Greek
 *    look-alikes of Latin letters is folded to Latin when the surrounding text is Latin. Real Greek
 *    words in Greek text are never folded to Latin.
 *
 * `latin` feeds the English and markup checks, `greek` the Greek ones; both keep a map from each
 * position back to the source, so a span found in a detection form can be cut from the source text.
 */

/** Cyrillic and Greek letters that look like a Latin letter (case kept). */
const TO_LATIN: Readonly<Record<string, string>> = {
  // Cyrillic capitals
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y', Ү: 'Y',
  Ѕ: 'S', І: 'I', Ӏ: 'I', Ј: 'J', Ԛ: 'Q', Ԝ: 'W', Һ: 'H', Ԁ: 'D', Ѵ: 'V',
  // Cyrillic small letters
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', х: 'x', у: 'y', ү: 'y',
  ѕ: 's', і: 'i', ӏ: 'l', ј: 'j', ԛ: 'q', ԝ: 'w', һ: 'h', ԁ: 'd', ь: 'b', п: 'n', г: 'r', ѵ: 'v', ѡ: 'w',
  // Greek capitals
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y',
  Χ: 'X', Ϲ: 'C', Ϳ: 'J',
  // Greek small letters
  α: 'a', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', γ: 'y', ϲ: 'c', ϳ: 'j',
};

/** Latin letters that look like a Greek letter (case kept). */
const TO_GREEK: Readonly<Record<string, string>> = {
  A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', Y: 'Υ', X: 'Χ',
  a: 'α', i: 'ι', k: 'κ', v: 'ν', o: 'ο', p: 'ρ', t: 'τ', u: 'υ', x: 'χ', y: 'γ',
};

type Script = 'latin' | 'greek' | 'cyrillic' | 'other';

const LATIN = /\p{Script=Latin}/u;
const GREEK = /\p{Script=Greek}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const FORMAT = /\p{Cf}/u;
const LETTER = /[\p{L}\p{M}]/u;
const MARK = /\p{M}/u;

function scriptOf(ch: string): Script {
  if (LATIN.test(ch)) return 'latin';
  if (GREEK.test(ch)) return 'greek';
  if (CYRILLIC.test(ch)) return 'cyrillic';
  return 'other';
}

export interface DetectionForm {
  text: string;
  /**
   * For each UTF-16 index of `text`: [start, end) of the source code point it came from; null when the
   * form is the source text itself (ASCII text, the common case, is never copied or mapped).
   */
  starts: number[] | null;
  ends: number[] | null;
}

export interface DetectionForms {
  latin: DetectionForm;
  greek: DetectionForm;
}

interface Piece {
  ch: string;
  start: number;
  end: number;
}

/** NFKC per code point and format characters dropped, with each piece's source range. */
function compatibilityPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;
  for (const cp of text) {
    const start = i;
    i += cp.length;
    if (cp < '\u0080') {
      pieces.push({ ch: cp, start, end: i });
      continue;
    }
    if (FORMAT.test(cp)) continue;
    for (const ch of cp.normalize('NFKC')) {
      if (!FORMAT.test(ch)) pieces.push({ ch, start, end: i });
    }
  }
  return pieces;
}

/** Index ranges [start, end) of the words (letter runs) of the pieces. */
function wordRanges(pieces: readonly Piece[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  pieces.forEach((p, i) => {
    const letter = LETTER.test(p.ch);
    if (letter && start < 0) start = i;
    if (!letter && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, pieces.length]);
  return out;
}

/** Every letter of the word has a Latin look-alike (combining marks are ignored). */
function lookAlikesOnly(pieces: readonly Piece[], start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) {
    const ch = pieces[i]?.ch ?? '';
    if (!MARK.test(ch) && !(ch in TO_LATIN)) return false;
  }
  return true;
}

function fold(pieces: readonly Piece[], target: 'latin' | 'greek', latinText: boolean): Piece[] {
  const out = pieces.map((p) => ({ ...p }));
  const table = target === 'latin' ? TO_LATIN : TO_GREEK;
  for (const [start, end] of wordRanges(pieces)) {
    const scripts = new Set<Script>();
    for (let i = start; i < end; i += 1) {
      const s = scriptOf(pieces[i]?.ch ?? '');
      if (s !== 'other') scripts.add(s);
    }
    const mixed = scripts.size > 1;
    let foldWord: boolean;
    if (target === 'latin') {
      // Mixed words always; a whole Cyrillic or Greek word only when every letter has a Latin
      // look-alike and the text around it is Latin.
      foldWord = mixed || (latinText && scripts.size === 1 && !scripts.has('latin') && lookAlikesOnly(pieces, start, end));
    } else {
      // Greek checks: a Greek word with Latin or Cyrillic look-alikes inside it.
      foldWord = mixed && scripts.has('greek');
    }
    if (!foldWord) continue;
    for (let i = start; i < end; i += 1) {
      const p = out[i];
      if (!p) continue;
      const viaLatin = target === 'greek' && CYRILLIC.test(p.ch) ? (TO_LATIN[p.ch] ?? p.ch) : p.ch;
      p.ch = table[viaLatin] ?? viaLatin;
    }
  }
  return out;
}

function toForm(pieces: readonly Piece[]): DetectionForm {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (const p of pieces) {
    text += p.ch;
    for (let k = 0; k < p.ch.length; k += 1) {
      starts.push(p.start);
      ends.push(p.end);
    }
  }
  return { text, starts, ends };
}

/**
 * True when the text is Latin: more letters in Latin words than in Greek and Cyrillic words. Mixed
 * words and words made only of Latin look-alikes do not count (they are what is being decided).
 */
function isLatinText(pieces: readonly Piece[]): boolean {
  let latin = 0;
  let other = 0;
  for (const [start, end] of wordRanges(pieces)) {
    const scripts = new Set<Script>();
    for (let i = start; i < end; i += 1) {
      const s = scriptOf(pieces[i]?.ch ?? '');
      if (s !== 'other') scripts.add(s);
    }
    if (scripts.size !== 1) continue;
    if (scripts.has('latin')) latin += end - start;
    else if (!lookAlikesOnly(pieces, start, end)) other += end - start;
  }
  return latin > other;
}

const NON_ASCII = /[\u0080-\u{10ffff}]/u;

export function detectionForms(text: string): DetectionForms {
  if (!NON_ASCII.test(text)) {
    const same: DetectionForm = { text, starts: null, ends: null };
    return { latin: same, greek: same };
  }
  const pieces = compatibilityPieces(text);
  const latinText = isLatinText(pieces);
  return { latin: toForm(fold(pieces, 'latin', latinText)), greek: toForm(fold(pieces, 'greek', latinText)) };
}

/** The form the English and markup checks see (see detectionForms). */
export function latinDetectionText(text: string): string {
  return detectionForms(text).latin.text;
}

/** Source range [start, end) of the detection-form range [from, to). */
export function sourceRange(form: DetectionForm, from: number, to: number): [number, number] {
  if (form.starts === null || form.ends === null) return [from, Math.max(from, to)];
  if (to <= from) return [form.starts[from] ?? 0, form.starts[from] ?? 0];
  return [form.starts[from] ?? 0, form.ends[to - 1] ?? 0];
}
