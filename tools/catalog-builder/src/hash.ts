import { CATALOG_CHUNK_SIZE } from '@skepi/core';
import { createHash, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface FileDigest {
  sizeBytes: number;
  sha256: string;
  chunkSize: number;
  /** SHA-256 of every `chunkSize` slice (the last one may be shorter). */
  chunkSha256: string[];
}

/** Streaming SHA-256 of the whole file and of each chunk, in one pass. */
export async function digestFile(path: string, chunkSize = CATALOG_CHUNK_SIZE): Promise<FileDigest> {
  const { size } = await stat(path);
  const whole = createHash('sha256');
  const chunks: string[] = [];
  let chunk: Hash = createHash('sha256');
  let inChunk = 0;
  for await (const data of createReadStream(path, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
    whole.update(data);
    let offset = 0;
    while (offset < data.length) {
      const take = Math.min(chunkSize - inChunk, data.length - offset);
      chunk.update(data.subarray(offset, offset + take));
      inChunk += take;
      offset += take;
      if (inChunk === chunkSize) {
        chunks.push(chunk.digest('hex'));
        chunk = createHash('sha256');
        inChunk = 0;
      }
    }
  }
  if (inChunk > 0 || chunks.length === 0) chunks.push(chunk.digest('hex'));
  return { sizeBytes: size, sha256: whole.digest('hex'), chunkSize, chunkSha256: chunks };
}
