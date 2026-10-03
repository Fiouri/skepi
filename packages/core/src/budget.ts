import type { Chunk } from './chunk';

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
  coverage: number;
}

export interface BudgetOptions {
  budgetTokens: number;
  maxSources: number;
}

/** Context budget per device tier (T1 = 800 tokens). */
export const TIER_BUDGET_TOKENS = { T1: 800, T2: 2000, T3: 5000 } as const;

/**
 * Fills the token budget preferring article diversity: first the best chunk of
 * each article (by score), then the remaining chunks by score. Never exceeds
 * the budget; chunks with zero score are never selected.
 */
export function selectWithinBudget(ranked: readonly ScoredChunk[], opts: BudgetOptions): ScoredChunk[] {
  const relevant = [...ranked].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  const selected: ScoredChunk[] = [];
  const used = new Set<string>();
  const seenArticles = new Set<string>();
  let tokens = 0;

  const tryAdd = (r: ScoredChunk): void => {
    if (selected.length >= opts.maxSources || used.has(r.chunk.id)) return;
    if (tokens + r.chunk.tokens > opts.budgetTokens) return;
    selected.push(r);
    used.add(r.chunk.id);
    tokens += r.chunk.tokens;
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
