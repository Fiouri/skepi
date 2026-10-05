import type { KnowledgeEngine, SearchHit, SearchOptions } from '@skepi/contracts';
import { describe, expect, it } from 'vitest';
import { suggestTitles } from '../src/suggest';

function engine(byArchive: Record<string, string[]>): KnowledgeEngine & { calls: SearchOptions[] } {
  const calls: SearchOptions[] = [];
  return {
    calls,
    openArchive: () => Promise.reject(new Error('unused')),
    getArticle: () => Promise.reject(new Error('unused')),
    getPlainText: () => Promise.reject(new Error('unused')),
    closeArchive: () => Promise.resolve(),
    search: (_query: string, opts: SearchOptions): Promise<SearchHit[]> => {
      calls.push(opts);
      // Like the phone: archives concatenated in the engine's own (hash) order, not the requested one.
      const ids = [...(opts.archiveIds ?? [])].sort();
      return Promise.resolve(
        ids.flatMap((id) =>
          (byArchive[id] ?? []).slice(0, opts.limit).map((path, rank) => ({ archiveId: id, path, title: path, snippet: null, score: null, rank })),
        ),
      );
    },
  };
}

const ARCHIVES = [
  { archiveId: 'el', language: 'ell' },
  { archiveId: 'med', language: 'eng' },
  { archiveId: 'top', language: 'eng' },
];

describe('suggestTitles', () => {
  it('lists packs in the language of the typed text first and caps every pack', async () => {
    const knowledge = engine({ el: ['Λονδίνο'], med: ['London_Hospital', 'Lonidamine'], top: ['London', 'Londonderry', 'London_Eye'] });
    const hits = await suggestTitles(knowledge, 'Lond', { archives: ARCHIVES, limit: 5, perPack: 2 });
    expect(hits.map((h) => h.path)).toEqual(['London_Hospital', 'Lonidamine', 'London', 'Londonderry', 'Λονδίνο']);
    expect(knowledge.calls[0]).toMatchObject({ mode: 'suggest', limit: 2, archiveIds: ['med', 'top', 'el'] });
  });

  it('puts the Greek pack first for Greek input and respects the total limit', async () => {
    const knowledge = engine({ el: ['Αθήνα', 'Αθηνά'], top: ['Athens'] });
    const hits = await suggestTitles(knowledge, 'Αθ', { archives: ARCHIVES, limit: 2, perPack: 8 });
    expect(hits.map((h) => h.path)).toEqual(['Αθήνα', 'Αθηνά']);
  });

  it('returns nothing for empty input or no packs', async () => {
    const knowledge = engine({});
    expect(await suggestTitles(knowledge, '  ', { archives: ARCHIVES, limit: 5, perPack: 2 })).toEqual([]);
    expect(await suggestTitles(knowledge, 'x', { archives: [], limit: 5, perPack: 2 })).toEqual([]);
    expect(knowledge.calls).toHaveLength(0);
  });
});
