import type { Chunk } from './chunk';
import type { Lang } from './text';
import { tokenizerProfile } from './tokens';

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
  coverage: number;
}

export interface BudgetOptions {
  budgetChars: number;
  maxSources: number;
}

export type BudgetTier = 'T1' | 'T2' | 'T3';

/**
 * Context budget per tier and question language, in characters of source text. Characters are what
 * the user's content is measured in; tokens (prefill time) follow from the active model's measured
 * tokens-per-character (Qwen2.5: Greek ≈ 4× English), see `resolveContextBudget`.
 * T1/T2 are sized for the first-token targets on CPU (Phase 1b, S23 measurements in
 * docs/phase-1b-report.md); T3 (desktop) is a placeholder until the desktop app exists.
 */
export const CONTEXT_BUDGET_CHARS: Readonly<Record<BudgetTier, Readonly<Record<Lang, number>>>> = {
  T1: { en: 1800, el: 650 },
  T2: { en: 2600, el: 1000 },
  T3: { en: 12000, el: 6000 },
};

/** Maximum number of passages per tier (Layer 1 shows them, Layer 2 reads them). */
export const MAX_SOURCES: Readonly<Record<BudgetTier, number>> = { T1: 3, T2: 4, T3: 8 };

export interface ContextBudget {
  tier: BudgetTier;
  lang: Lang;
  /** Characters of source text that may enter the prompt. */
  chars: number;
  /** Estimated prompt tokens for those characters with the active model's tokenizer. */
  tokens: number;
  tokensPerChar: number;
  maxSources: number;
  /** True when the character budget was reduced to fit the model context. */
  clamped: boolean;
}

/**
 * Character budget for a question, converted to tokens with the active model's tokens-per-character
 * and clamped so that sources + `reservedTokens` (system prompt, question, answer) fit `contextSize`.
 */
export function resolveContextBudget(input: {
  tier: BudgetTier;
  lang: Lang;
  modelId: string | null;
  contextSize: number;
  reservedTokens: number;
}): ContextBudget {
  const tokensPerChar = tokenizerProfile(input.modelId).tokensPerChar[input.lang];
  const wanted = CONTEXT_BUDGET_CHARS[input.tier][input.lang];
  const available = Math.max(0, input.contextSize - input.reservedTokens);
  const fitting = Math.floor(available / tokensPerChar);
  const chars = Math.min(wanted, fitting);
  return {
    tier: input.tier,
    lang: input.lang,
    chars,
    tokens: Math.ceil(chars * tokensPerChar),
    tokensPerChar,
    maxSources: MAX_SOURCES[input.tier],
    clamped: chars < wanted,
  };
}

/**
 * Fills the character budget preferring article diversity: first the best chunk of each article (by
 * score), then the remaining chunks by score. Never exceeds the budget; chunks with zero score are
 * never selected.
 */
export function selectWithinBudget(ranked: readonly ScoredChunk[], opts: BudgetOptions): ScoredChunk[] {
  const relevant = [...ranked].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  const selected: ScoredChunk[] = [];
  const used = new Set<string>();
  const seenArticles = new Set<string>();
  let chars = 0;

  const tryAdd = (r: ScoredChunk): void => {
    if (selected.length >= opts.maxSources || used.has(r.chunk.id)) return;
    if (chars + r.chunk.text.length > opts.budgetChars) return;
    selected.push(r);
    used.add(r.chunk.id);
    chars += r.chunk.text.length;
  };

  for (const r of relevant) {
    const article = `${r.chunk.archiveId}/${r.chunk.path}`;
    if (seenArticles.has(article)) continue;
    seenArticles.add(article);
    tryAdd(r);
  }
  for (const r of relevant) tryAdd(r);

  return selected.sort((a, b) => b.score - a.score);
}
