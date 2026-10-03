import { stem, tokenize } from './text';

export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Result {
  id: string;
  score: number;
  /** Distinct query terms present in the document. */
  matchedTerms: number;
  /** matchedTerms / distinct query terms (0..1). */
  coverage: number;
}

export interface Bm25Options {
  k1: number;
  b: number;
}

export const DEFAULT_BM25: Bm25Options = { k1: 1.2, b: 0.75 };

export function analyze(text: string): string[] {
  return tokenize(text).map(stem);
}

/**
 * Okapi BM25 over a small candidate set. IDF uses the Lucene variant
 * log(1 + (N - df + 0.5) / (df + 0.5)), which is always positive.
 */
export function rankBm25(
  queryTerms: readonly string[],
  docs: readonly Bm25Document[],
  options: Partial<Bm25Options> = {},
): Bm25Result[] {
  const { k1, b } = { ...DEFAULT_BM25, ...options };
  const terms = [...new Set(queryTerms.flatMap(analyze))];
  if (terms.length === 0 || docs.length === 0) return [];

  const analyzed = docs.map((d) => {
    const tokens = analyze(d.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: d.id, length: tokens.length, tf };
  });
  const n = analyzed.length;
  const avgLength = analyzed.reduce((sum, d) => sum + d.length, 0) / n || 1;
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = analyzed.reduce((count, d) => count + (d.tf.has(term) ? 1 : 0), 0);
    idf.set(term, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  const results = analyzed.map((d) => {
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      const f = d.tf.get(term) ?? 0;
      if (f === 0) continue;
      matched += 1;
      const norm = f + k1 * (1 - b + (b * d.length) / avgLength);
      score += (idf.get(term) ?? 0) * ((f * (k1 + 1)) / norm);
    }
    return { id: d.id, score, matchedTerms: matched, coverage: matched / terms.length };
  });
  return results.sort((x, y) => y.score - x.score || y.coverage - x.coverage);
}
