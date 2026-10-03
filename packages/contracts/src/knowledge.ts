/** A content file already present on the device (real filesystem path, never a SAF URI). */
export interface PackFile {
  packId: string;
  path: string;
}

export interface ArchiveInfo {
  archiveId: string;
  packId: string;
  title: string;
  language: string;
  articleCount: number;
  hasFulltextIndex: boolean;
  hasTitleIndex: boolean;
  mainPath: string | null;
}

/** `suggest` = title suggestions as you type; `fulltext` = Xapian full-text search. */
export type SearchMode = 'suggest' | 'fulltext';

export interface SearchOptions {
  mode: SearchMode;
  limit: number;
  /** Restrict to these archives; all open archives when omitted. */
  archiveIds?: readonly string[];
}

export interface SearchHit {
  archiveId: string;
  path: string;
  title: string;
  snippet: string | null;
  /** Engine-specific score; not comparable across archives. */
  score: number | null;
  /** 0-based rank inside the archive that produced the hit. */
  rank: number;
}

export interface Article {
  archiveId: string;
  path: string;
  title: string;
  mimeType: string;
  html: string;
}

export interface ArticleSection {
  heading: string;
  level: number;
  text: string;
}

export interface ArticleText {
  archiveId: string;
  path: string;
  title: string;
  sections: ArticleSection[];
}

export interface KnowledgeEngine {
  openArchive(file: PackFile): Promise<ArchiveInfo>;
  search(query: string, opts: SearchOptions): Promise<SearchHit[]>;
  getArticle(archiveId: string, path: string): Promise<Article>;
  getPlainText(archiveId: string, path: string): Promise<ArticleText>;
  closeArchive(archiveId: string): Promise<void>;
}
