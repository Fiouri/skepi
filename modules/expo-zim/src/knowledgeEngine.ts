import type {
  Article,
  ArchiveInfo,
  ArticleText,
  KnowledgeEngine,
  PackFile,
  SearchHit,
  SearchOptions,
} from '@skepi/contracts';
import ExpoZim from './ExpoZimModule';

export interface ZimKnowledgeEngine extends KnowledgeEngine {
  /** Last native timing per call kind, for the bench screen. */
  readonly lastNativeMs: { search: number; suggest: number; plainText: number };
}

/** KnowledgeEngine adapter over the ExpoZim native module (Android). */
export function createZimKnowledgeEngine(): ZimKnowledgeEngine {
  const lastNativeMs = { search: 0, suggest: 0, plainText: 0 };

  return {
    lastNativeMs,

    async openArchive(file: PackFile): Promise<ArchiveInfo> {
      const info = await ExpoZim.openArchive(file.path);
      return {
        archiveId: info.archiveId,
        packId: file.packId,
        title: info.title,
        language: info.language,
        articleCount: info.articleCount,
        hasFulltextIndex: info.hasFulltextIndex,
        hasTitleIndex: info.hasTitleIndex,
        mainPath: info.mainPath,
      };
    },

    async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
      const archiveIds = opts.archiveIds ? [...opts.archiveIds] : null;
      if (opts.mode === 'suggest') {
        const result = await ExpoZim.suggest(query, opts.limit, archiveIds);
        lastNativeMs.suggest = result.nativeMs;
        return result.hits;
      }
      const result = await ExpoZim.search(query, opts.limit, archiveIds, false);
      lastNativeMs.search = result.nativeMs;
      return result.hits;
    },

    async getArticle(archiveId: string, path: string): Promise<Article> {
      const a = await ExpoZim.getArticleHtml(archiveId, path);
      return { archiveId: a.archiveId, path: a.path, title: a.title, mimeType: a.mimeType, html: a.html };
    },

    async getPlainText(archiveId: string, path: string): Promise<ArticleText> {
      const t = await ExpoZim.getPlainText(archiveId, path);
      lastNativeMs.plainText = t.nativeMs;
      return { archiveId: t.archiveId, path: t.path, title: t.title, sections: t.sections };
    },

    closeArchive(archiveId: string): Promise<void> {
      return ExpoZim.closeArchive(archiveId);
    },
  };
}
