import type { SearchHit } from '@skepi/contracts';

export const RRF_K = 60;

/**
 * Reciprocal rank fusion of several ranked hit lists (different queries or
 * different archives). Scores from different Xapian indexes are not comparable,
 * ranks are.
 */
export function reciprocalRankFusion(lists: readonly (readonly SearchHit[])[], k = RRF_K): SearchHit[] {
  const fused = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = `${hit.archiveId}\n${hit.path}`;
      const add = 1 / (k + rank + 1);
      const existing = fused.get(key);
      if (existing) existing.score += add;
      else fused.set(key, { hit, score: add });
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ hit, score }, rank) => ({ ...hit, score, rank }));
}
