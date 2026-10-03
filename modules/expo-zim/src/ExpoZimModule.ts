import { NativeModule, requireNativeModule } from 'expo';
import type { DeviceSnapshot } from '@skepi/contracts';
import type {
  BlockedRequest,
  CpuInfo,
  DeviceInfo,
  MemoryInfo,
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
  getMemoryInfo(): Promise<MemoryInfo>;
  getCpuInfo(): Promise<CpuInfo>;
  getDeviceInfo(): Promise<DeviceInfo>;
  getDeviceSnapshot(): Promise<DeviceSnapshot>;
  writeContentFile(relativePath: string, text: string): Promise<string>;
}

export default requireNativeModule<ExpoZimNativeModule>('ExpoZim');
