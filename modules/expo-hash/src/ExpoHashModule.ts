import { NativeModule, requireNativeModule } from 'expo';

export interface HashProgressEvent {
  jobId: string;
  hashedBytes: number;
  totalBytes: number;
}

export interface NativeFileDigest {
  sizeBytes: number;
  sha256: string;
  chunkSize: number;
  chunkSha256: string[];
  ms: number;
}

type HashEvents = { onHashProgress: (event: HashProgressEvent) => void };

declare class ExpoHashNativeModule extends NativeModule<HashEvents> {
  hashFile(path: string, chunkSize: number, jobId: string): Promise<NativeFileDigest>;
  cancel(jobId: string): void;
}

export default requireNativeModule<ExpoHashNativeModule>('ExpoHash');
