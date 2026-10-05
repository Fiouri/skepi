import type { SearchHit } from '@skepi/contracts';

export const RRF_K = 60;

export interface FusionOptions {
  k?: number;
  /**
   * Rank offset per archive (0 = preferred). Retrieval passes the full-text top-K for archives in
   * another language than the question, so a Greek pack's hits for an English question rank after a
   * full list of English hits.
   */
  archiveOffset?: (archiveId: string) => number;
}

/**
 * Reciprocal rank fusion of several ranked hit lists (different queries; each list may hold the hits
 * of several archives). Scores from different Xapian indexes are not comparable, ranks are: every hit
 * counts with its rank inside its own archive (`SearchHit.rank`), never with its position in the
 * concatenated list, so the result does not depend on the order in which an engine returns its
 * archives (Phase 1c: the phone listed archives in hash order, rag-eval in open order). Ties break on
 * language offset, best rank, archive id and path: identical on every engine for the same archives.
 */
export function reciprocalRankFusion(lists: readonly (readonly SearchHit[])[], options: FusionOptions = {}): SearchHit[] {
  const k = options.k ?? RRF_K;
  const offset = options.archiveOffset ?? (() => 0);
  const fused = new Map<string, { hit: SearchHit; score: number; offset: number; best: number }>();
  for (const list of lists) {
    for (const hit of list) {
      const key = `${hit.archiveId}\n${hit.path}`;
      const o = offset(hit.archiveId);
      const add = 1 / (k + o + hit.rank + 1);
      const existing = fused.get(key);
      if (existing) {
        existing.score += add;
        existing.best = Math.min(existing.best, hit.rank);
      } else {
        fused.set(key, { hit, score: add, offset: o, best: hit.rank });
      }
    }
  }
  const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...fused.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.offset - b.offset ||
        a.best - b.best ||
        byKey(a.hit.archiveId, b.hit.archiveId) ||
        byKey(a.hit.path, b.hit.path),
    )
    .map(({ hit, score }, rank) => ({ ...hit, score, rank }));
}
