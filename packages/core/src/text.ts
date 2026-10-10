export type Lang = 'el' | 'en';

const MARKS = /\p{M}+/gu;
const WORD = /[\p{L}\p{N}]+/gu;
const GREEK_LETTER = /[Ͱ-Ͽἀ-῿]/u;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/u;

/** Lowercase, strip diacritics (tonos, dialytika) and normalise final sigma. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').toLowerCase().replace(/ς/g, 'σ').normalize('NFC');
}

export function tokenize(text: string): string[] {
  return foldText(text).match(WORD) ?? [];
}

/** Deterministic script-based language detection (no model). */
export function detectLanguage(text: string): Lang {
  let greek = 0;
  let latin = 0;
  for (const ch of text) {
    if (GREEK_LETTER.test(ch)) greek += 1;
    else if (LATIN_LETTER.test(ch)) latin += 1;
  }
  return greek > 0 && greek >= latin ? 'el' : 'en';
}

// Folded forms (no accents, final sigma -> σ).
const STOPWORDS_EL = new Set(
  (
    'ο η το οι τα του τησ των τον την στο στη στην στον στα στουσ στισ σε απο με για προσ κατα μετα ' +
    'παρα υπο χωρισ μεχρι και η ειτε ουτε αλλα ομωσ ενω αν οταν οτι πωσ που ποιοσ ποια ποιο ποιοι ποιεσ ' +
    'ποιων τι γιατι ποτε ποσο ποσα ποσεσ ποσοι πια ενασ μια ενα μιασ ενοσ εναν δεν μη μην θα να ' +
    'ειναι ειμαι εισαι ειμαστε ειστε ηταν εχει εχω εχουν εχουμε μπορω μπορει μπορουμε πρεπει κανω κανει ' +
    'αυτοσ αυτη αυτο αυτοι αυτεσ αυτα αυτου αυτησ αυτων αυτον αυτην εγω εσυ εμεισ εσεισ μου σου μασ σασ ' +
    'τουσ τισ τοσο πολυ λιγο ολα ολοι ολεσ καθε κατι κανεισ καποιοσ καποια καποιο εδω εκει τωρα πριν ' +
    'μετα παντα ακομα ηδη πλεον επισησ μονο ναι οχι ωσ σαν ' +
    // Interrogatives and light verbs: they carry the question form, not the topic.
    'ποσουσ ποσων ποσοσ ποση ποιουσ ποιαν ποιον ποιασ ποιου ποιεσ ποιεσ πουθενα ποτε πωσ γιατι ' +
    'βρισκεται βρισκονται υπαρχει υπαρχουν γινεται γινονται λεγεται λεγονται ονομαζεται ονομαζονται ' +
    'σημαινει κανουμε κανουν πρεπει χρειαζεται χρειαζομαι θελω ξερω πεσ εξηγησε'
  ).split(/\s+/),
);

const STOPWORDS_EN = new Set(
  (
    'a an the and or but if then else of to in on at by for with from into onto about as is are was were ' +
    'be been being am do does did doing have has had having i you he she it we they me him her us them my ' +
    'your his its our their this that these those what which who whom whose when where why how can could ' +
    'should would will shall may might must not no yes so than too very just also only there here up down ' +
    'out over under again further once all any both each few more most other some such own same s t don ' +
    'please tell explain many much located called named mean means need'
  ).split(/\s+/),
);

export function isStopword(token: string): boolean {
  return STOPWORDS_EL.has(token) || STOPWORDS_EN.has(token);
}

const GREEK_SUFFIXES = [
  'ουμενοσ', 'ουμενη', 'ουμενο', 'ομενοσ', 'ομενη', 'ομενο', 'ησεισ', 'ησεων', 'ματοσ', 'ματων', 'ματα',
  'ουσεσ', 'ουμε', 'ουσα', 'ουνε', 'ειτε', 'ησει', 'ηση', 'ησησ', 'σεισ', 'σεων', 'σεωσ', 'οντασ', 'ωντασ',
  'ιεσ', 'ιων', 'εια', 'ειο', 'ικοσ', 'ικη', 'ικο', 'ικα', 'ικεσ', 'ικων', 'ουν', 'ουσ', 'ουμ',
  'ων', 'οσ', 'ου', 'ησ', 'ασ', 'εσ', 'ισ', 'υσ', 'οι', 'αι', 'ει', 'ια', 'ιο', 'μα',
  'α', 'η', 'ο', 'ε', 'ι', 'υ', 'ω',
];
const MIN_STEM = 3;
const GREEK_TRUNCATE = 5;
const ENGLISH_SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ies', 'ied', 'ed', 'es', 's'];

/**
 * Light suffix-stripping stemmer used only to match query terms against the
 * small candidate set (Xapian already stems at retrieval time).
 */
export function stem(token: string): string {
  const greek = GREEK_LETTER.test(token);
  let out = token;
  for (const suffix of greek ? GREEK_SUFFIXES : ENGLISH_SUFFIXES) {
    if (token.length - suffix.length >= MIN_STEM && token.endsWith(suffix)) {
      out = token.slice(0, token.length - suffix.length);
      break;
    }
  }
  // Greek verbs and nouns inflect far beyond a suffix list (καθαρίζω / καθαρίζεται /
  // καθαρισμός); truncating the stem is a well-known robust approximation for Greek IR.
  if (greek) return out.slice(0, GREEK_TRUNCATE);
  // earthquake / earthquakes -> earthquak
  return out.length > MIN_STEM + 1 && out.endsWith('e') ? out.slice(0, -1) : out;
}

/**
 * A folded keyword as a search-engine term. Folding maps final ς to σ for matching, but the ZIM's
 * Xapian index keeps ς (it folds case and accents only): "αριστοτελησ" finds nothing, "αριστοτελης"
 * finds the article.
 */
export function toQueryTerm(keyword: string): string {
  return GREEK_LETTER.test(keyword) ? keyword.replace(/σ$/u, 'ς') : keyword;
}

/** Query terms for retrieval: folded, stopwords removed, deduplicated, in order. */
export function extractKeywords(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(query)) {
    if (token.length < 2 || isStopword(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

// Sentence end: . ! ? ; (the Greek question mark is ';' or U+037E) and the Greek ano teleia.
// Splitting needs whitespace after the mark, so decimals (170.934, 3.5) stay whole.
const SENTENCE_SPLIT = /(?<=[.!?;;·])\s+/u;

function proseSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A unit of source text: a prose sentence, or a piece of a table written as text. Every `|` is a hard
 * boundary (a table cell is never merged with its neighbours into one "sentence"); text between two
 * `|` is a table cell (`cell`), which Layer 1 never highlights on its own. Text before the first and
 * after the last `|` is prose.
 * `pipeBefore` / `pipeAfter` record the delimiters so that joining units keeps the cells apart.
 */
export interface TextUnit {
  text: string;
  cell: boolean;
  pipeBefore: boolean;
  pipeAfter: boolean;
}

/** Splits text into units (see TextUnit); text without `|` gives exactly its prose sentences. */
export function splitUnits(text: string): TextUnit[] {
  const segments = text.split('|');
  if (segments.length === 1) return proseSentences(text).map((s) => ({ text: s, cell: false, pipeBefore: false, pipeAfter: false }));
  const units: TextUnit[] = [];
  let pendingPipe = false;
  segments.forEach((segment, i) => {
    if (i > 0) pendingPipe = true;
    const sentences = proseSentences(segment);
    sentences.forEach((s, j) => {
      units.push({ text: s, cell: i > 0 && i < segments.length - 1, pipeBefore: pendingPipe && j === 0, pipeAfter: false });
      pendingPipe = false;
    });
  });
  const last = units[units.length - 1];
  if (last && text.trimEnd().endsWith('|')) last.pipeAfter = true;
  return units;
}

/** Joins units back into text, keeping a `|` wherever cells were delimited. */
export function joinUnits(units: readonly TextUnit[]): string {
  return units.map((u) => `${u.pipeBefore ? '| ' : ''}${u.text}${u.pipeAfter ? ' |' : ''}`).join(' ');
}

/** Splits text into trimmed, non-empty sentences (table cells are separate sentences, see splitUnits). */
export function splitSentences(text: string): string[] {
  return splitUnits(text).map((u) => u.text);
}

/**
 * Content terms of a text in order (folded, stopwords removed, stemmed, duplicates kept so that
 * positions stay meaningful for bigrams). Numbers are kept: they carry facts.
 */
export function contentTerms(text: string): string[] {
  const out: string[] = [];
  for (const token of tokenize(text)) {
    if (token.length < 2 || isStopword(token)) continue;
    out.push(stem(token));
  }
  return out;
}

/** Distinct content terms of a question: what Layer 1 matches and what the relevance rule checks. */
export function questionTerms(question: string): string[] {
  return [...new Set(contentTerms(question))];
}
