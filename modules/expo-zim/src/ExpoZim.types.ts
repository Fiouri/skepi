import type { StyleProp, ViewStyle } from 'react-native';

export interface ZimArchiveInfo {
  archiveId: string;
  path: string;
  title: string;
  language: string;
  name: string;
  flavour: string;
  date: string;
  articleCount: number;
  hasFulltextIndex: boolean;
  hasTitleIndex: boolean;
  mainPath: string | null;
  sizeBytes: number;
  openMs: number;
}

export interface ZimHit {
  archiveId: string;
  path: string;
  title: string;
  snippet: string | null;
  score: number | null;
  rank: number;
}

export interface ZimSearchResult {
  hits: ZimHit[];
  /** Time spent in native code (excludes the JS bridge). */
  nativeMs: number;
  estimatedMatches?: number;
}

export interface ZimArticleHtml {
  archiveId: string;
  path: string;
  title: string;
  mimeType: string;
  html: string;
  nativeMs: number;
}

export interface ZimSection {
  heading: string;
  level: number;
  text: string;
}

export interface ZimPlainText {
  archiveId: string;
  path: string;
  title: string;
  sections: ZimSection[];
  nativeMs: number;
  cached: boolean;
}

export interface ZimContentFile {
  kind: 'zim' | 'models' | 'maps' | 'icu';
  name: string;
  path: string;
  sizeBytes: number;
}

export interface ZimRuntimeInfo {
  contentDir: string;
  icuDataDir: string | null;
  nativeInitMs: number;
}

export interface BlockedRequest {
  url: string;
  reason: string;
  atMs: number;
}

export interface MemoryInfo {
  totalRamMb: number;
  availRamMb: number;
  lowMemory: boolean;
  thresholdMb: number;
  peakRssMb: number;
  rssMb: number;
  nativeHeapMb: number;
}

export interface CpuInfo {
  cores: number;
  performanceCores: number;
  performanceCoreIds: number[];
  maxFreqKhz: number[];
  abi: string;
}

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  device: string;
  soc: string;
  sdkInt: number;
  release: string;
}

export interface UrlEventPayload {
  url: string;
}

export interface LoadEndPayload extends UrlEventPayload {
  title: string;
}

export interface BlockedEventPayload extends UrlEventPayload {
  reason: string;
}

export interface ZimArticleViewProps {
  /** `zim://<archiveId>/<path>`; anything else is refused and reported. */
  url: string;
  onLoadStart?: (event: { nativeEvent: UrlEventPayload }) => void;
  onLoadEnd?: (event: { nativeEvent: LoadEndPayload }) => void;
  onBlockedRequest?: (event: { nativeEvent: BlockedEventPayload }) => void;
  onExternalLink?: (event: { nativeEvent: UrlEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
