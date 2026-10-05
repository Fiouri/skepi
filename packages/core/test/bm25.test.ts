import type { SearchHit } from '@skepi/contracts';
import { describe, expect, it } from 'vitest';
import { rankBm25 } from '../src/bm25';
import { reciprocalRankFusion } from '../src/fusion';

describe('rankBm25', () => {
  const docs = [
    { id: 'water', text: 'Ο καθαρισμός του νερού γίνεται με βρασμό. Το νερό βράζει για ένα λεπτό.' },
    { id: 'fire', text: 'Η πυρκαγιά σβήνει με νερό ή πυροσβεστήρα.' },
    { id: 'city', text: 'Η Πάτρα είναι πόλη της Αχαΐας.' },
  ];

  it('ranks the document with more matching terms first and reports coverage', () => {
    const results = rankBm25(['καθαρισμοσ', 'νερου'], docs);
    expect(results[0]?.id).toBe('water');
    expect(results[0]?.coverage).toBe(1);
    expect(results.find((r) => r.id === 'fire')?.coverage).toBe(0.5);
    expect(results.find((r) => r.id === 'city')?.score).toBe(0);
  });

  it('matches across accents and inflection', () => {
    const results = rankBm25(['Πάτρας'], docs);
    expect(results[0]?.id).toBe('city');
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('prefers shorter documents for equal term frequency', () => {
    const results = rankBm25(['pump'], [
      { id: 'long', text: `pump ${'filler '.repeat(50)}` },
      { id: 'short', text: 'pump filler' },
    ]);
    expect(results.map((r) => r.id)).toEqual(['short', 'long']);
  });

  it('returns empty for empty input', () => {
    expect(rankBm25([], docs)).toEqual([]);
    expect(rankBm25(['νερο'], [])).toEqual([]);
  });
});

describe('reciprocalRankFusion', () => {
  const hit = (path: string, archiveId = 'a', rank = 0): SearchHit => ({
    archiveId,
    path,
    title: path,
    snippet: null,
    score: null,
    rank,
  });

  it('boosts documents that appear in several lists and re-ranks', () => {
    const fused = reciprocalRankFusion([
      [hit('x', 'a', 0), hit('y', 'a', 1)],
      [hit('y', 'a', 0), hit('z', 'a', 1)],
    ]);
    expect(fused.map((h) => h.path)).toEqual(['y', 'x', 'z']);
    expect(fused.map((h) => h.rank)).toEqual([0, 1, 2]);
  });

  it('keeps the same path from different archives apart', () => {
    expect(reciprocalRankFusion([[hit('x', 'a'), hit('x', 'b')]])).toHaveLength(2);
  });

  it('uses the rank inside each archive, so the archive order of an engine does not matter', () => {
    const a = [hit('a0', 'A', 0), hit('a1', 'A', 1), hit('b0', 'B', 0), hit('b1', 'B', 1)];
    const b = [hit('b0', 'B', 0), hit('b1', 'B', 1), hit('a0', 'A', 0), hit('a1', 'A', 1)];
    const paths = (lists: SearchHit[][]): string[] => reciprocalRankFusion(lists).map((h) => h.path);
    expect(paths([a])).toEqual(paths([b]));
    expect(paths([a])).toEqual(['a0', 'b0', 'a1', 'b1']);
  });

  it('ranks archives with an offset (another language) after the preferred ones', () => {
    const fused = reciprocalRankFusion([[hit('el0', 'el', 0), hit('en0', 'en', 0), hit('en1', 'en', 1)]], {
      archiveOffset: (id) => (id === 'el' ? 8 : 0),
    });
    expect(fused.map((h) => h.path)).toEqual(['en0', 'en1', 'el0']);
  });
});
