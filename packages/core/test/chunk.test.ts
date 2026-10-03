import type { ArticleText } from '@skepi/contracts';
import { describe, expect, it } from 'vitest';
import { chunkArticle } from '../src/chunk';

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
// 1 token per word keeps the arithmetic obvious.
const countTokens = wordCount;

function sentence(words: number, tag: string): string {
  return `${Array.from({ length: words - 1 }, (_, i) => `${tag}${i}`).join(' ')} τέλος.`;
}

function article(sections: { heading: string; text: string }[]): ArticleText {
  return {
    archiveId: 'a1',
    path: 'A/Test',
    title: 'Test',
    sections: sections.map((s) => ({ ...s, level: 2 })),
  };
}

describe('chunkArticle', () => {
  it('packs sentences up to the target and never crosses sections', () => {
    const text = Array.from({ length: 10 }, (_, i) => sentence(50, `w${i}_`)).join(' ');
    const chunks = chunkArticle(
      article([
        { heading: 'Intro', text },
        { heading: 'Other', text: 'Μικρή ενότητα.' },
      ]),
      { countTokens },
    );
    const intro = chunks.filter((c) => c.heading === 'Intro');
    expect(intro.length).toBe(2);
    for (const c of intro) {
      expect(c.tokens).toBeGreaterThanOrEqual(200);
      expect(c.tokens).toBeLessThanOrEqual(300);
    }
    expect(chunks.at(-1)?.heading).toBe('Other');
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(chunks[0]?.id).toBe('a1/A/Test#0');
  });

  it('hard-splits a sentence longer than maxTokens', () => {
    const chunks = chunkArticle(article([{ heading: '', text: sentence(700, 'x') }]), { countTokens });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.tokens).toBeLessThanOrEqual(300);
    expect(chunks.map((c) => c.text).join(' ').split(' ').length).toBe(700);
  });

  it('merges a tiny tail into the previous chunk when it fits', () => {
    const text = `${sentence(240, 'a')} ${sentence(10, 'b')}`;
    const chunks = chunkArticle(article([{ heading: '', text }]), { countTokens });
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.tokens).toBe(250);
  });

  it('splits on the Greek question mark and skips empty sections', () => {
    const chunks = chunkArticle(
      article([
        { heading: 'Empty', text: '   ' },
        { heading: 'Q', text: `${sentence(200, 'q')} Τι γίνεται; ${sentence(100, 'r')}` },
      ]),
      { countTokens },
    );
    expect(chunks.every((c) => c.heading === 'Q')).toBe(true);
    expect(chunks.length).toBe(2);
  });
});
