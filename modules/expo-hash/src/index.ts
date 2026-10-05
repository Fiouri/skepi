import ExpoHash, { type HashProgressEvent, type NativeFileDigest } from './ExpoHashModule';

export { default as ExpoHash } from './ExpoHashModule';
export type { HashProgressEvent, NativeFileDigest } from './ExpoHashModule';

/** Catalog chunk size (64 MiB), as in `@skepi/core` CATALOG_CHUNK_SIZE. */
export const HASH_CHUNK_SIZE = 64 * 1024 * 1024;

let nextJob = 0;

/**
 * SHA-256 of a file in app storage, on a native thread. `onProgress` gets hashed / total bytes;
 * aborting the signal cancels the native job (the promise rejects with ERR_HASH_CANCELLED).
 */
export async function hashFile(
  path: string,
  options: { chunkSize?: number; signal?: AbortSignal; onProgress?: (hashedBytes: number, totalBytes: number) => void } = {},
): Promise<NativeFileDigest> {
  nextJob += 1;
  const jobId = `hash-${String(nextJob)}`;
  const sub = options.onProgress
    ? ExpoHash.addListener('onHashProgress', (e: HashProgressEvent) => {
        if (e.jobId === jobId) options.onProgress?.(e.hashedBytes, e.totalBytes);
      })
    : null;
  const onAbort = (): void => {
    ExpoHash.cancel(jobId);
  };
  options.signal?.addEventListener('abort', onAbort);
  try {
    if (options.signal?.aborted) throw new Error('hash aborted');
    return await ExpoHash.hashFile(path, options.chunkSize ?? HASH_CHUNK_SIZE, jobId);
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    sub?.remove();
  }
}
