import type { ValidatedAnswer } from './citations';
import { analyze } from './bm25';
import { extractKeywords, stem } from './text';

/**
 * Grammar-constrained answer: the model must emit this JSON, so every sentence names exactly one
 * source id from the enum of ids actually present in the prompt. Grammar guarantees the format,
 * not the truth, which is why each citation is then checked against its source (supportScore).
 */
export interface StructuredAnswer {
  covered: boolean;
  sentences: { text: string; source: string }[];
}

/** T1 answers stay short; 5 pretty-printed sentences overran the 400-token limit on device. */
export const MAX_ANSWER_SENTENCES = 3;

export function answerJsonSchema(sourceIds: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      covered: { type: 'boolean' },
      sentences: {
        type: 'array',
        maxItems: MAX_ANSWER_SENTENCES,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            source: { type: 'string', enum: [...sourceIds] },
          },
          required: ['text', 'source'],
        },
      },
    },
    required: ['covered', 'sentences'],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses and shape-checks the model output; null when it is not the expected JSON. */
export function parseStructuredAnswer(raw: string): StructuredAnswer | null {
  // Tolerate stray template tokens or text around the object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.covered !== 'boolean' || !Array.isArray(data.sentences)) return null;
  const sentences: StructuredAnswer['sentences'] = [];
  for (const item of data.sentences) {
    if (!isRecord(item) || typeof item.text !== 'string' || typeof item.source !== 'string') return null;
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (text.length > 0) sentences.push({ text, source: item.source.trim().toUpperCase() });
  }
  return { covered: data.covered, sentences };
}

const NUMBER = /\d+(?:[.,]\d+)*/g;

/**
 * Deterministic support check: fraction of the sentence's content terms (stemmed) that occur in
 * the cited source. Every number in the sentence must appear verbatim in the source, otherwise the
 * score is 0 (the dosage rule of the architecture, applied to all numbers).
 */
export function supportScore(sentence: string, sourceText: string): number {
  const numbers = sentence.match(NUMBER) ?? [];
  if (numbers.some((n) => !sourceText.includes(n))) return 0;
  const terms = [...new Set(extractKeywords(sentence).map(stem))].filter((t) => t.length >= 3);
  if (terms.length === 0) return 0;
  const sourceTerms = new Set(analyze(sourceText));
  return terms.filter((t) => sourceTerms.has(t)).length / terms.length;
}

export interface CitedSource {
  id: string;
  title: string;
  heading: string;
  text: string;
}

export interface StructuredValidation extends ValidatedAnswer {
  /** Per sentence: cited id and its support score (null when the id was unknown). */
  sentences: { text: string; source: string; support: number | null; kept: boolean }[];
}

export const MIN_SUPPORT = 0.5;

/**
 * Turns a structured answer into display text with `[Sx]` markers, keeping a citation only when the
 * id exists and the sentence is supported by that source.
 */
export function validateStructured(
  answer: StructuredAnswer,
  sources: readonly CitedSource[],
  minSupport = MIN_SUPPORT,
): StructuredValidation {
  const byId = new Map(sources.map((s) => [s.id.toUpperCase(), s]));
  const cited: string[] = [];
  const invalid: string[] = [];
  const unsupported: string[] = [];
  const sentences: StructuredValidation['sentences'] = [];

  for (const s of answer.covered ? answer.sentences : []) {
    const source = byId.get(s.source);
    if (!source) {
      if (!invalid.includes(s.source)) invalid.push(s.source);
      sentences.push({ ...s, support: null, kept: false });
      continue;
    }
    const support = supportScore(s.text, `${source.title} ${source.heading} ${source.text}`);
    const kept = support >= minSupport;
    if (kept) {
      if (!cited.includes(s.source)) cited.push(s.source);
    } else if (!unsupported.includes(s.source)) {
      unsupported.push(s.source);
    }
    sentences.push({ ...s, support, kept });
  }

  const text = sentences
    .map((s) => (s.kept ? `${s.text.replace(/[.;!]+$/, '')} [${s.source}].` : s.text))
    .join(' ');
  const notCovered = !answer.covered || answer.sentences.length === 0;
  return { text, cited, invalid, unsupported, unverified: cited.length === 0, notCovered, sentences };
}
