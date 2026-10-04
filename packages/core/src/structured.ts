import type { Lang } from './text';
import { tokenizerProfile } from './tokens';
import { checkSentence, MIN_BIGRAM_SUPPORT, type CheckableSource, type SentenceRejection } from './validate';

/**
 * Grammar-constrained answer: the model must emit this JSON, so every sentence names exactly one
 * source id from the enum of ids actually present in the prompt. Grammar guarantees the format, not
 * the truth, which is why each sentence is then checked against its source (validate.ts).
 */
export interface StructuredAnswer {
  covered: boolean;
  sentences: { text: string; source: string }[];
  /** True when the JSON was cut off and only complete sentence objects were recovered. */
  truncated: boolean;
}

/**
 * Answer limit in tokens. English: ~150 (architecture). Greek costs ~4x more tokens per character
 * with Qwen2.5, so 150 tokens would leave ~60 characters per sentence; Greek gets 200.
 */
export const ANSWER_MAX_TOKENS: Readonly<Record<Lang, number>> = { en: 150, el: 200 };
export const ANSWER_MAX_SENTENCES: Readonly<Record<Lang, number>> = { en: 3, el: 2 };

/** JSON skeleton and per-sentence wrapper cost in tokens (Qwen2.5 output, rounded up). */
const JSON_OVERHEAD_TOKENS = 12;
const SENTENCE_OVERHEAD_TOKENS = 12;
const MAX_SENTENCE_CHARS = 220;

export interface AnswerLimits {
  maxTokens: number;
  maxSentences: number;
  /** maxLength of each sentence's text in the grammar, so the JSON closes within maxTokens. */
  maxSentenceChars: number;
}

export function answerLimits(lang: Lang, modelId: string | null, maxTokens = ANSWER_MAX_TOKENS[lang]): AnswerLimits {
  const maxSentences = ANSWER_MAX_SENTENCES[lang];
  const tokensPerChar = tokenizerProfile(modelId).tokensPerChar[lang];
  const textTokens = maxTokens - JSON_OVERHEAD_TOKENS - SENTENCE_OVERHEAD_TOKENS * maxSentences;
  const perSentence = Math.floor(textTokens / maxSentences / tokensPerChar);
  return { maxTokens, maxSentences, maxSentenceChars: Math.max(40, Math.min(MAX_SENTENCE_CHARS, perSentence)) };
}

export function answerJsonSchema(
  sourceIds: readonly string[],
  limits: Pick<AnswerLimits, 'maxSentences' | 'maxSentenceChars'>,
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      covered: { type: 'boolean' },
      sentences: {
        type: 'array',
        // At least one: with an optional array the 1.5B model often wrote `[` + whitespace + `]`
        // even when covered was true (rag-eval). Sentences of a not-covered answer are ignored.
        minItems: 1,
        maxItems: limits.maxSentences,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', maxLength: limits.maxSentenceChars },
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

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const COVERED = /"covered"\s*:\s*(true|false)/;
const SENTENCE_OBJECT = /\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"source"\s*:\s*"([^"\\]*)"\s*\}/g;

/** Complete `{"text","source"}` objects of a partial (streaming or cut-off) JSON answer. */
function salvage(raw: string): StructuredAnswer | null {
  const covered = raw.match(COVERED);
  if (!covered) return null;
  const sentences: StructuredAnswer['sentences'] = [];
  for (const m of raw.matchAll(SENTENCE_OBJECT)) {
    let text: unknown;
    try {
      text = JSON.parse(`"${m[1] ?? ''}"`);
    } catch {
      continue;
    }
    if (typeof text !== 'string') continue;
    const t = normalise(text);
    if (t.length > 0) sentences.push({ text: t, source: (m[2] ?? '').trim().toUpperCase() });
  }
  return { covered: covered[1] === 'true', sentences, truncated: true };
}

/**
 * Parses and shape-checks the model output. Output cut off at the token limit (or still streaming)
 * yields only its complete sentence objects; null when nothing usable is there.
 */
export function parseStructuredAnswer(raw: string): StructuredAnswer | null {
  // Tolerate stray template tokens or text around the object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0) return null;
  if (end <= start) return salvage(raw.slice(start));
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return salvage(raw.slice(start));
  }
  if (!isRecord(data) || typeof data.covered !== 'boolean' || !Array.isArray(data.sentences)) return null;
  const sentences: StructuredAnswer['sentences'] = [];
  for (const item of data.sentences) {
    if (!isRecord(item) || typeof item.text !== 'string' || typeof item.source !== 'string') return null;
    const text = normalise(item.text);
    if (text.length > 0) sentences.push({ text, source: item.source.trim().toUpperCase() });
  }
  return { covered: data.covered, sentences, truncated: false };
}

export interface ValidatedSentence {
  text: string;
  source: string;
  /** Bigram support against the cited source; null when the id is unknown or not covered. */
  support: number | null;
  kept: boolean;
  reason: SentenceRejection | null;
}

export interface StructuredValidation {
  /** Every sentence the model wrote, with its verdict (for metrics and debugging). */
  sentences: ValidatedSentence[];
  /** Only the sentences that passed every rule, in order: the AI summary that is shown. */
  kept: { text: string; source: string }[];
  /** Cited source ids of kept sentences, unique, in order of first appearance. */
  cited: string[];
  /** Ids the model used that are not in the prompt (dropped). */
  invalid: string[];
  /** The model reported that the sources do not cover the question. */
  notCovered: boolean;
  /** Display text with `[Sx]` markers after each kept sentence. */
  text: string;
}

/** Validates every sentence; a sentence that fails any rule is removed from the shown answer. */
export function validateStructured(
  answer: StructuredAnswer,
  sources: readonly CheckableSource[],
  question: string,
  minSupport = MIN_BIGRAM_SUPPORT,
): StructuredValidation {
  const byId = new Map(sources.map((s) => [s.id.toUpperCase(), s]));
  const sentences: ValidatedSentence[] = answer.sentences.map((s) =>
    answer.covered
      ? { ...s, ...checkSentence(s.text, byId.get(s.source), question, minSupport) }
      : { ...s, kept: false, support: null, reason: null },
  );
  const kept = sentences.filter((s) => s.kept).map((s) => ({ text: s.text, source: s.source }));
  const cited = [...new Set(kept.map((s) => s.source))];
  const invalid = [...new Set(sentences.filter((s) => s.reason === 'unknown_source').map((s) => s.source))];
  const text = kept.map((s) => `${s.text.replace(/[.;!·]+$/u, '')} [${s.source}].`).join(' ');
  return { sentences, kept, cited, invalid, notCovered: !answer.covered, text };
}
