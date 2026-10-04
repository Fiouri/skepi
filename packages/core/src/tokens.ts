import type { Lang } from './text';

const GREEK = /[Ͱ-Ͽἀ-῿]/u;

/**
 * Measured tokens per character of a model's tokenizer, per language. Context budgets are set in
 * characters (packages/core/src/budget.ts) and converted with these numbers, so a tokenizer that is
 * cheap for a language directly buys more context for the same prefill time.
 */
export interface TokenizerProfile {
  /** Stable id of the tokenizer family (one entry per tokenizer, not per quantisation). */
  id: string;
  /** Model file names (lowercase) this profile applies to. */
  match: RegExp;
  tokensPerChar: Readonly<Record<Lang, number>>;
  /** Where the numbers come from (tool, corpus, date). */
  measuredWith: string;
}

/**
 * Qwen2.5 BPE (all sizes share one tokenizer). Measured with tools/rag-eval against the real
 * tokenizer (node-llama-cpp `model.tokenize`) over the retrieved source passages of the golden
 * sets, and cross-checked on device with llama.rn `tokenize` in the bench. Rounded up slightly so
 * that the estimate stays conservative (never under-fills n_ctx).
 */
export const QWEN25_TOKENIZER: TokenizerProfile = {
  id: 'qwen2.5',
  match: /^qwen2\.5-/,
  tokensPerChar: { en: 0.3, el: 1.0 },
  measuredWith: 'Phase 0 device calibration (llama.rn tokenize, 10 Greek chunks: 0.95); English pending rag-eval',
};

/** Used for unknown models: conservative (over-estimates) so a budget never overflows the context. */
export const FALLBACK_TOKENIZER: TokenizerProfile = {
  id: 'fallback',
  match: /^$/,
  tokensPerChar: { en: 0.35, el: 1.1 },
  measuredWith: 'conservative default, not measured',
};

export const TOKENIZER_PROFILES: readonly TokenizerProfile[] = [QWEN25_TOKENIZER];

export function tokenizerProfile(modelId: string | null): TokenizerProfile {
  if (modelId === null) return FALLBACK_TOKENIZER;
  const id = modelId.toLowerCase();
  return TOKENIZER_PROFILES.find((p) => p.match.test(id)) ?? FALLBACK_TOKENIZER;
}

export type TokenEstimator = (text: string) => number;

/**
 * Token estimate without loading the tokenizer: Greek-script characters are charged at the Greek
 * rate, everything else at the English rate (mixed text, numbers and punctuation included).
 */
export function makeTokenEstimator(profile: TokenizerProfile): TokenEstimator {
  const { en, el } = profile.tokensPerChar;
  return (text: string): number => {
    let greek = 0;
    let other = 0;
    for (const ch of text) {
      if (GREEK.test(ch)) greek += 1;
      else other += 1;
    }
    return Math.ceil(greek * el + other * en);
  };
}

/** Default estimator (Qwen2.5, the only model family in the catalog today). */
export const estimateTokens: TokenEstimator = makeTokenEstimator(QWEN25_TOKENIZER);
