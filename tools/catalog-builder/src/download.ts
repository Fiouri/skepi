import { createWriteStream, existsSync } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

/**
 * The only network code of the catalog-builder (dev machine, never in the app or CI): official
 * downloads into the local cache with resume, and the publisher's checksum file. Allowed by an
 * ESLint override for this file only (architecture: network access only in ContentStore / tooling).
 */
const USER_AGENT = 'skepi-catalog-builder';

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${String(res.status)}`);
  return res.text();
}

/** Kiwix `.sha256` files: `<hex>  <file name>`. */
export async function fetchUpstreamSha256(url: string): Promise<string> {
  const text = (await fetchText(url)).trim();
  const hex = /^([0-9a-fA-F]{64})\b/.test(text) ? text.slice(0, 64) : null;
  if (!hex) throw new Error(`${url}: no SHA-256 found`);
  return hex.toLowerCase();
}

/** Downloads to `<target>.partial` with HTTP Range resume, then renames. Returns the target path. */
export async function downloadTo(url: string, target: string, log: (line: string) => void): Promise<string> {
  if (existsSync(target)) return target;
  const partial = `${target}.partial`;
  const have = existsSync(partial) ? (await stat(partial)).size : 0;
  const headers: Record<string, string> = { 'user-agent': USER_AGENT };
  if (have > 0) headers.range = `bytes=${String(have)}-`;
  log(`downloading ${url}${have > 0 ? ` (resume at ${String(have)})` : ''}`);
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`GET ${url}: HTTP ${String(res.status)}`);
  const append = have > 0 && res.status === 206;
  if (have > 0 && !append) await rm(partial, { force: true });
  await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(partial, { flags: append ? 'a' : 'w' }));
  await rename(partial, target);
  return target;
}
