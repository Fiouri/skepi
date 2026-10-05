import { NativeModule, requireNativeModule } from 'expo';
import type {
  BlockedRequest,
  ZimArchiveInfo,
  ZimArticleHtml,
  ZimContentFile,
  ZimPlainText,
  ZimRuntimeInfo,
  ZimSearchResult,
} from './ExpoZim.types';

declare class ExpoZimNativeModule extends NativeModule {
  getRuntimeInfo(): Promise<ZimRuntimeInfo>;
  listContent(): Promise<ZimContentFile[]>;
  openArchive(path: string): Promise<ZimArchiveInfo>;
  closeArchive(archiveId: string): Promise<void>;
  suggest(query: string, limit: number, archiveIds: string[] | null): Promise<ZimSearchResult>;
  search(query: string, limit: number, archiveIds: string[] | null, withSnippets: boolean): Promise<ZimSearchResult>;
  getArticleHtml(archiveId: string, path: string): Promise<ZimArticleHtml>;
  getPlainText(archiveId: string, path: string): Promise<ZimPlainText>;
  getBlockedRequests(): Promise<BlockedRequest[]>;
  clearBlockedRequests(): Promise<void>;
  writeContentFile(relativePath: string, text: string): Promise<string>;
  /** UTF-8 text of a file under the content dir (max 4 MB); null when it does not exist. */
  readContentFile(relativePath: string): Promise<string | null>;
}

export default requireNativeModule<ExpoZimNativeModule>('ExpoZim');
