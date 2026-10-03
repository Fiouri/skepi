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
  const hit = (path: string, archiveId = 'a'): SearchHit => ({
    archiveId,
    path,
    title: path,
    snippet: null,
    score: null,
    rank: 0,
  });

  it('boosts documents that appear in several lists and re-ranks', () => {
    const fused = reciprocalRankFusion([
      [hit('x'), hit('y')],
      [hit('y'), hit('z')],
    ]);
    expect(fused.map((h) => h.path)).toEqual(['y', 'x', 'z']);
    expect(fused.map((h) => h.rank)).toEqual([0, 1, 2]);
  });

  it('keeps the same path from different archives apart', () => {
    expect(reciprocalRankFusion([[hit('x', 'a'), hit('x', 'b')]])).toHaveLength(2);
  });
});
