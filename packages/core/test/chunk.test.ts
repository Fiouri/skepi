import type { ArticleText } from '@skepi/contracts';
import { describe, expect, it } from 'vitest';
import { chunkArticle } from '../src/chunk';

// Sentences of exactly `chars` characters (including the final full stop) keep the arithmetic obvious.
function sentence(chars: number, tag: string): string {
  const body = `${tag} ${'x'.repeat(Math.max(0, chars - tag.length - 2))}`;
  return `${body.slice(0, chars - 1)}.`;
}

function article(sections: { heading: string; text: string }[]): ArticleText {
  return {
    archiveId: 'a1',
    path: 'A/Test',
    title: 'Test',
    sections: sections.map((s) => ({ ...s, level: 2 })),
  };
}

const opts = { targetChars: 600, maxChars: 800, minTailChars: 150 };

describe('chunkArticle', () => {
  it('packs sentences up to the target and never crosses sections', () => {
    const text = Array.from({ length: 10 }, (_, i) => sentence(100, `s${i}`)).join(' ');
    const chunks = chunkArticle(
      article([
        { heading: 'Intro', text },
        { heading: 'Other', text: 'Small section.' },
      ]),
      opts,
    );
    const intro = chunks.filter((c) => c.heading === 'Intro');
    expect(intro.length).toBe(2);
    for (const c of intro) {
      expect(c.text.length).toBeGreaterThanOrEqual(300);
      expect(c.text.length).toBeLessThanOrEqual(600);
    }
    expect(chunks.at(-1)?.heading).toBe('Other');
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(chunks[0]?.id).toBe('a1/A/Test#0');
  });

  it('hard-splits a sentence longer than maxChars on word boundaries', () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkArticle(article([{ heading: '', text: `${words}.` }]), opts);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(800);
    expect(chunks.map((c) => c.text).join(' ').split(' ').length).toBe(400);
  });

  it('merges a short tail into the previous chunk when it fits', () => {
    const text = `${sentence(590, 'a')} ${sentence(60, 'b')}`;
    const chunks = chunkArticle(article([{ heading: '', text }]), opts);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.text.length).toBe(651);
  });

  it('splits on the Greek question mark, keeps decimals whole and skips empty sections', () => {
    const chunks = chunkArticle(
      article([
        { heading: 'Empty', text: '   ' },
        { heading: 'Q', text: `${sentence(590, 'q')} Τι γίνεται; Έχει 170.934 κατοίκους. ${sentence(400, 'r')}` },
      ]),
      opts,
    );
    expect(chunks.every((c) => c.heading === 'Q')).toBe(true);
    expect(chunks.length).toBe(2);
    expect(chunks[1]?.text.startsWith('Τι γίνεται; Έχει 170.934 κατοίκους.')).toBe(true);
  });

  it('fills the token estimate with the injected estimator', () => {
    const chunks = chunkArticle(article([{ heading: '', text: 'abcd efgh.' }]), { ...opts, countTokens: (t) => t.length * 2 });
    expect(chunks[0]?.tokens).toBe(20);
  });
});
