export interface LatencySummary {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

/** Nearest-rank percentile (p in 0..100) of a non-empty sample. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new Error('percentile of empty sample');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const value = sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
  if (value === undefined) throw new Error('unreachable');
  return value;
}

export function summarize(samples: readonly number[]): LatencySummary {
  return {
    count: samples.length,
    min: percentile(samples, 0),
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: percentile(samples, 100),
    mean: samples.reduce((s, x) => s + x, 0) / samples.length,
  };
}
