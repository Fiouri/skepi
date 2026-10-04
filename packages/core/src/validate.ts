import { contentTerms, foldText, questionTerms, splitSentences } from './text';

/**
 * Post-validation of AI sentences (architecture, RAG pipeline step 9). Every rule is deterministic
 * and runs per sentence; a sentence that fails any rule is removed, never shown "shaded".
 */

/** Matching key of a stemmed term: stems are light, so a short prefix absorbs most inflection. */
function key(term: string): string {
  return term.slice(0, 6);
}

function keys(text: string): string[] {
  return contentTerms(text).map(key);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Adjacent content-term pairs of a sentence (unordered, so "France's capital" = "capital of France"). */
export function contentBigrams(text: string): string[] {
  const k = keys(text);
  const out: string[] = [];
  for (let i = 0; i + 1 < k.length; i += 1) {
    const a = k[i];
    const b = k[i + 1];
    if (a !== undefined && b !== undefined && a !== b) out.push(pairKey(a, b));
  }
  return [...new Set(out)];
}

/** Window (in content terms) within which two terms of one source sentence count as a bigram. */
export const SOURCE_PAIR_WINDOW = 5;
/** Wider window for the coherence graph: terms of one source sentence that belong to one fact. */
export const COHERENCE_WINDOW = 8;

/**
 * Content-term pairs of a source that occur within `window` positions of each other inside one
 * sentence (a fact is stated in a sentence; pairs across sentences would let a sentence stitch two
 * facts together). Title terms pair with every term: the title is the implicit subject of every
 * sentence of the article ("It is the capital of France" under the title "Paris").
 */
export function sourcePairs(source: { title: string; text: string }, window = SOURCE_PAIR_WINDOW): Set<string> {
  const out = new Set<string>();
  const titleKeys = [...new Set(keys(source.title))];
  for (const sentence of splitSentences(source.text)) {
    const k = keys(sentence);
    for (let i = 0; i < k.length; i += 1) {
      const a = k[i];
      if (a === undefined) continue;
      for (const t of titleKeys) if (t !== a) out.add(pairKey(a, t));
      for (let j = i + 1; j <= i + window && j < k.length; j += 1) {
        const b = k[j];
        if (b !== undefined && a !== b) out.add(pairKey(a, b));
      }
    }
  }
  return out;
}

/**
 * Fraction of the sentence's content bigrams that the source supports (0..1). A sentence with fewer
 * than two content terms states nothing checkable and scores 0. Single-word overlap (the Phase 0
 * check) let incoherent sentences through; pairs of terms that are close together in one source
 * sentence mostly do not.
 */
export function bigramSupport(sentence: string, source: { title: string; text: string }): number {
  const bigrams = contentBigrams(sentence);
  if (bigrams.length === 0) return 0;
  const pairs = sourcePairs(source);
  return bigrams.filter((b) => pairs.has(b)).length / bigrams.length;
}

/**
 * Coherence: the sentence's content terms must form one connected graph, where two terms are linked
 * when they co-occur in one source sentence (or one of them is in the title). "Spyridon Louis rebuilt
 * the stadium in 1884" has well-supported bigrams (3 of 4), but "Spyridon Louis" and "stadium rebuilt
 * 1884" come from different sentences: two components, so it is rejected.
 */
export function isCoherent(sentence: string, source: { title: string; text: string }): boolean {
  const terms = [...new Set(keys(sentence))];
  if (terms.length < 2) return false;
  const pairs = sourcePairs(source, COHERENCE_WINDOW);
  const seen = new Set<string>([terms[0] ?? '']);
  const queue = [terms[0] ?? ''];
  while (queue.length > 0) {
    const a = queue.shift() ?? '';
    for (const b of terms) {
      if (!seen.has(b) && pairs.has(pairKey(a, b))) {
        seen.add(b);
        queue.push(b);
      }
    }
  }
  return seen.size === terms.length;
}

/**
 * Calibrated with tools/rag-eval: the eval sweeps this threshold over every raw model sentence of the
 * golden sets and reports precision/recall per value (docs/phase-1b-report.md).
 */
export const MIN_BIGRAM_SUPPORT = 0.5;

/** Relevance rule: the sentence shares at least one content term with the question. */
export function isRelevant(sentence: string, question: string): boolean {
  const q = new Set(questionTerms(question).map(key));
  if (q.size === 0) return false;
  return keys(sentence).some((k) => q.has(k));
}

const NUMBER_SOURCE = String.raw`\d+(?:[.,]\d+)*`;
const NUMBER = new RegExp(NUMBER_SOURCE, 'gu');

// Folded forms (lowercase, no accents, final sigma → σ). Longer alternatives need no ordering:
// the trailing look-ahead rejects a unit that is only a prefix of a longer word.
const UNITS = [
  // mass, volume, concentration
  'mg', 'mcg', 'µg', 'μg', 'ug', 'g', 'kg', 'ml', 'cl', 'dl', 'l', 'cc', 'iu', 'units?', 'mmol', 'mol', 'ppm',
  'mmhg', 'bpm', 'kcal', 'cal', 'grams?', 'kilograms?', 'kilos?', 'litres?', 'liters?', 'millilitres?', 'milliliters?',
  'teaspoons?', 'tablespoons?', 'tsp', 'tbsp', 'cups?',
  // temperature, percent
  '°c', '°f', 'ºc', 'ºf', 'degrees?', '%', 'percent', 'per cent',
  // time
  's', 'sec', 'secs', 'seconds?', 'min', 'mins', 'minutes?', 'h', 'hr', 'hrs', 'hours?', 'days?', 'weeks?', 'months?', 'years?',
  // doses
  'tablets?', 'pills?', 'capsules?', 'drops?', 'doses?', 'times', 'puffs?', 'sachets?',
  // distance
  'km', 'm', 'cm', 'mm', 'miles?', 'metres?', 'meters?',
  // Greek
  'λεπτα', 'λεπτο', 'λεπτων', 'ωρα', 'ωρεσ', 'ωρων', 'ημερα', 'ημερεσ', 'ημερων', 'μερεσ', 'δευτερολεπτα',
  'δευτερολεπτο', 'εβδομαδα', 'εβδομαδεσ', 'μηνα', 'μηνεσ', 'χρονια', 'χρονο', 'ετη', 'ετων', 'χαπι', 'χαπια',
  'δισκιο', 'δισκια', 'καψουλα', 'καψουλεσ', 'σταγονα', 'σταγονεσ', 'δοση', 'δοσεισ', 'φορα', 'φορεσ', 'μοναδεσ',
  'βαθμουσ', 'βαθμοι', 'βαθμο', 'τοισ εκατο', 'χλμ', 'χιλιομετρα', 'μετρα', 'εκατοστα', 'κιλα', 'κιλο',
  'γραμμαρια', 'γραμμαριο', 'λιτρα', 'λιτρο', 'χιλιοστολιτρα',
];
const UNIT = `(?:${UNITS.join('|')})`;
const NUMBER_UNIT = new RegExp(
  String.raw`(${NUMBER_SOURCE})\s*(?:-\s*)?(${UNIT}(?:\s*\/\s*${UNIT})?)(?![\p{L}\p{N}])`,
  'gu',
);

/** Canonical "number+unit" strings in a text (folded, spacing removed): "5 mg" and "5mg" are equal. */
export function findNumberUnits(text: string): string[] {
  const folded = foldText(text).replace(/\s+/g, ' ');
  const out: string[] = [];
  for (const m of folded.matchAll(NUMBER_UNIT)) {
    const num = m[1];
    const unit = m[2];
    if (num !== undefined && unit !== undefined) out.push(`${num}${unit.replace(/\s+/g, '')}`);
  }
  return out;
}

/** Numbers of a text as whole tokens ("17" does not match inside "170.934"). */
export function findNumbers(text: string): string[] {
  return text.match(NUMBER) ?? [];
}

/** Any number with a unit must appear verbatim (same number, same unit) in the cited source. */
export function numberUnitsVerbatim(sentence: string, sourceText: string): boolean {
  const wanted = findNumberUnits(sentence);
  if (wanted.length === 0) return true;
  const available = new Set(findNumberUnits(sourceText));
  return wanted.every((w) => available.has(w));
}

/** Every bare number must also occur in the source as a whole number. */
export function numbersVerbatim(sentence: string, sourceText: string): boolean {
  const wanted = findNumbers(sentence);
  if (wanted.length === 0) return true;
  const available = new Set(findNumbers(sourceText));
  return wanted.every((w) => available.has(w));
}

export type SentenceRejection = 'unknown_source' | 'irrelevant' | 'number_unit' | 'number' | 'unsupported';

export interface SentenceCheck {
  kept: boolean;
  /** Null when the cited id is unknown. */
  support: number | null;
  reason: SentenceRejection | null;
}

export interface CheckableSource {
  id: string;
  title: string;
  heading: string;
  text: string;
}

/** Runs every rule on one sentence, cheapest and most decisive first. */
export function checkSentence(
  sentence: string,
  source: CheckableSource | undefined,
  question: string,
  minSupport = MIN_BIGRAM_SUPPORT,
): SentenceCheck {
  if (!source) return { kept: false, support: null, reason: 'unknown_source' };
  // The heading belongs to the title side: it names what the passage is about.
  const scope = { title: `${source.title} ${source.heading}`, text: source.text };
  const sourceText = `${scope.title}. ${source.text}`;
  const support = bigramSupport(sentence, scope);
  if (!numberUnitsVerbatim(sentence, sourceText)) return { kept: false, support, reason: 'number_unit' };
  if (!numbersVerbatim(sentence, sourceText)) return { kept: false, support, reason: 'number' };
  if (!isRelevant(sentence, question)) return { kept: false, support, reason: 'irrelevant' };
  if (support < minSupport || !isCoherent(sentence, scope)) return { kept: false, support, reason: 'unsupported' };
  return { kept: true, support, reason: null };
}
