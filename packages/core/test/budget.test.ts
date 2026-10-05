import { describe, expect, it } from 'vitest';
import { CONTEXT_BUDGET_CHARS, resolveContextBudget, selectWithinBudget, type ScoredChunk } from '../src/budget';
import type { Chunk } from '../src/chunk';
import { estimateTokens, FALLBACK_TOKENIZER, makeTokenEstimator, QWEN25_TOKENIZER, tokenizerProfile } from '../src/tokens';

function scored(path: string, index: number, chars: number, score: number): ScoredChunk {
  const chunk: Chunk = {
    id: `a/${path}#${index}`,
    archiveId: 'a',
    path,
    articleTitle: path,
    heading: '',
    text: 'x'.repeat(chars),
    tokens: Math.ceil(chars / 4),
    index,
  };
  return { chunk, score, coverage: 1 };
}

describe('selectWithinBudget', () => {
  it('never exceeds the character budget', () => {
    const ranked = [scored('A', 0, 700, 9), scored('B', 0, 700, 8), scored('C', 0, 700, 7)];
    const selected = selectWithinBudget(ranked, { budgetChars: 1800, maxSources: 6 });
    expect(selected.reduce((s, r) => s + r.chunk.text.length, 0)).toBeLessThanOrEqual(1800);
    expect(selected).toHaveLength(2);
  });

  it('prefers article diversity over a second chunk of the best article', () => {
    const ranked = [scored('A', 0, 500, 10), scored('A', 1, 500, 9), scored('B', 0, 500, 3), scored('C', 0, 500, 2)];
    const selected = selectWithinBudget(ranked, { budgetChars: 1600, maxSources: 6 });
    expect(selected.map((s) => s.chunk.path).sort()).toEqual(['A', 'B', 'C']);
  });

  it('fills leftover budget with further chunks, skips zero scores, honours maxSources', () => {
    const ranked = [scored('A', 0, 100, 10), scored('A', 1, 100, 9), scored('B', 0, 100, 0)];
    const selected = selectWithinBudget(ranked, { budgetChars: 1800, maxSources: 6 });
    expect(selected.map((s) => s.chunk.id)).toEqual(['a/A#0', 'a/A#1']);
    expect(selectWithinBudget(ranked, { budgetChars: 1800, maxSources: 1 })).toHaveLength(1);
  });

  it('skips a chunk that does not fit but keeps trying smaller ones', () => {
    const ranked = [scored('A', 0, 1500, 10), scored('B', 0, 400, 9), scored('C', 0, 200, 8)];
    const selected = selectWithinBudget(ranked, { budgetChars: 1800, maxSources: 6 });
    expect(selected.map((s) => s.chunk.path)).toEqual(['A', 'C']);
  });

  it('orders articles by their best score and the passages of one article by reading order', () => {
    const ranked = [scored('A', 3, 100, 10), scored('B', 0, 100, 9), scored('A', 0, 100, 8), scored('B', 2, 100, 1)];
    const selected = selectWithinBudget(ranked, { budgetChars: 1800, maxSources: 6 });
    expect(selected.map((s) => s.chunk.id)).toEqual(['a/A#0', 'a/A#3', 'a/B#0', 'a/B#2']);
  });
});

describe('resolveContextBudget', () => {
  const qwen = 'qwen2.5-1.5b-instruct-q4_0.gguf';

  it('converts the per-language character budget with the model tokens-per-character', () => {
    const en = resolveContextBudget({ tier: 'T1', lang: 'en', modelId: qwen, contextSize: 2048, reservedTokens: 400 });
    const el = resolveContextBudget({ tier: 'T1', lang: 'el', modelId: qwen, contextSize: 2048, reservedTokens: 400 });
    expect(en.chars).toBe(CONTEXT_BUDGET_CHARS.T1.en);
    expect(el.chars).toBe(CONTEXT_BUDGET_CHARS.T1.el);
    expect(en.tokens).toBe(Math.ceil(en.chars * QWEN25_TOKENIZER.tokensPerChar.en));
    expect(el.tokens).toBe(Math.ceil(el.chars * QWEN25_TOKENIZER.tokensPerChar.el));
    expect(en.clamped).toBe(false);
    expect(en.maxSources).toBe(3);
  });

  it('clamps the budget so the whole prompt fits the context', () => {
    const b = resolveContextBudget({ tier: 'T3', lang: 'el', modelId: qwen, contextSize: 2048, reservedTokens: 548 });
    expect(b.clamped).toBe(true);
    expect(b.tokens).toBeLessThanOrEqual(1500);
    expect(b.chars).toBe(Math.floor(1500 / QWEN25_TOKENIZER.tokensPerChar.el));
  });

  it('uses the conservative fallback for unknown models', () => {
    const b = resolveContextBudget({ tier: 'T2', lang: 'en', modelId: 'mystery-7b.gguf', contextSize: 4096, reservedTokens: 300 });
    expect(b.tokensPerChar).toBe(FALLBACK_TOKENIZER.tokensPerChar.en);
    expect(b.tokens).toBeGreaterThan(resolveContextBudget({ tier: 'T2', lang: 'en', modelId: qwen, contextSize: 4096, reservedTokens: 300 }).tokens);
  });

  it('never returns a negative budget', () => {
    expect(resolveContextBudget({ tier: 'T1', lang: 'en', modelId: qwen, contextSize: 512, reservedTokens: 900 }).chars).toBe(0);
  });
});

describe('token estimator', () => {
  it('selects the tokenizer profile by model file name', () => {
    expect(tokenizerProfile('Qwen2.5-0.5B-Instruct-Q4_0.gguf').id).toBe('qwen2.5');
    expect(tokenizerProfile(null).id).toBe('fallback');
  });

  it('charges Greek script at the Greek rate and everything else at the English rate', () => {
    const estimate = makeTokenEstimator({ ...QWEN25_TOKENIZER, tokensPerChar: { en: 0.25, el: 1 } });
    expect(estimate('abcd')).toBe(1);
    expect(estimate('αβγδ')).toBe(4);
    expect(estimate('ab αβ')).toBe(3);
    expect(estimateTokens('')).toBe(0);
  });
});
