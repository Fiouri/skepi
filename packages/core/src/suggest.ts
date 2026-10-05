import type { KnowledgeEngine, SearchHit } from '@skepi/contracts';
import { archiveMatchesLanguage, type ArchiveRef } from './rag';
import { detectLanguage } from './text';

export interface SuggestOptions {
  /** Open archives with their ZIM language. */
  archives: readonly ArchiveRef[];
  /** Suggestions shown in total. */
  limit: number;
  /** Suggestions asked from each pack (the engine runs the packs in parallel). */
  perPack: number;
}

/** 20 suggestions in total, at most 8 per pack: with 3+ packs no single large pack fills the list. */
export const DEFAULT_SUGGEST = { limit: 20, perPack: 8 } as const;

/**
 * Title suggestions while typing across several packs: packs in the language of the typed text come
 * first (their hits lead the list), every pack is capped at `perPack`, and the engine queries the
 * packs in parallel (ExpoZim `suggest`), so latency follows the slowest pack, not their sum.
 */
export async function suggestTitles(knowledge: KnowledgeEngine, query: string, options: SuggestOptions): Promise<SearchHit[]> {
  if (query.trim().length === 0 || options.archives.length === 0) return [];
  const lang = detectLanguage(query);
  const preferred = (a: ArchiveRef): number => (archiveMatchesLanguage(a.language, lang) ? 0 : 1);
  const ordered = [...options.archives].sort((a, b) => preferred(a) - preferred(b));
  const position = new Map(ordered.map((a, i) => [a.archiveId, i]));
  const hits = await knowledge.search(query, {
    mode: 'suggest',
    limit: options.perPack,
    archiveIds: ordered.map((a) => a.archiveId),
  });
  return [...hits]
    .sort((a, b) => (position.get(a.archiveId) ?? ordered.length) - (position.get(b.archiveId) ?? ordered.length) || a.rank - b.rank)
    .slice(0, options.limit);
}
