const GREEK = /[Ͱ-Ͽἀ-῿]/u;

/**
 * Conservative token estimate for Qwen-family BPE tokenizers without loading
 * the tokenizer. Greek is far more expensive per character than Latin script.
 * Calibrated against the real tokenizer in the on-device bench.
 */
export const GREEK_TOKENS_PER_CHAR = 0.5;
export const OTHER_TOKENS_PER_CHAR = 0.28;

export function estimateTokens(text: string): number {
  let greek = 0;
  let other = 0;
  for (const ch of text) {
    if (GREEK.test(ch)) greek += 1;
    else other += 1;
  }
  return Math.ceil(greek * GREEK_TOKENS_PER_CHAR + other * OTHER_TOKENS_PER_CHAR);
}
