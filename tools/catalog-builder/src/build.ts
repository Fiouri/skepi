import {
  CATALOG_SCHEMA,
  KEY_LIST_SCHEMA,
  parseCatalog,
  parseKeyList,
  signBytes,
  utf8,
  verifyCatalog,
  verifyKeyList,
  type Catalog,
  type CatalogPack,
  type KeyList,
  type TrustedKey,
} from '@skepi/core';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { downloadTo, fetchUpstreamSha256 } from './download';
import { digestFile } from './hash';
import { REPO_ROOT } from './keys';
import type { Manifest, ManifestPack } from './manifest';

export interface SigningKey {
  keyId: string;
  secretKey: Uint8Array;
}

export interface Signed {
  bytes: Uint8Array;
  /** Base64 Ed25519 signature over `bytes` (the content of `<file>.sig`). */
  signature: string;
}

export interface BuildOptions {
  manifest: Manifest;
  /** Where downloads are cached (and where already downloaded files are found). */
  cacheDir: string;
  key: SigningKey;
  /** Sequence of the catalog this one replaces; the new one must be higher. */
  previousSequence: number | null;
  /** Explicit sequence; default previous + 1. */
  sequence?: number;
  issuedAt?: string;
  /** Root for `local` sources (default: the repository). */
  localRoot?: string;
  log?: (line: string) => void;
}

/** Sequence of an existing catalog file, or null when there is none. */
export function sequenceOf(path: string): number | null {
  if (!existsSync(path)) return null;
  return parseCatalog(JSON.parse(readFileSync(path, 'utf8')) as unknown).sequence;
}

export function nextSequence(previous: number | null, requested: number | undefined): number {
  const sequence = requested ?? (previous ?? 0) + 1;
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error(`invalid sequence ${String(sequence)}`);
  if (previous !== null && sequence <= previous) {
    throw new Error(`sequence must always increase: ${String(sequence)} <= previous ${String(previous)}`);
  }
  return sequence;
}

async function packFile(pack: ManifestPack, opts: BuildOptions): Promise<{ path: string; upstream: string | null }> {
  const log = opts.log ?? (() => undefined);
  const source = pack.source;
  if (source.kind === 'local') {
    const root = opts.localRoot ?? REPO_ROOT;
    return { path: isAbsolute(source.path) ? source.path : resolve(root, source.path), upstream: null };
  }
  await mkdir(opts.cacheDir, { recursive: true });
  const path = await downloadTo(source.url, join(opts.cacheDir, pack.file), log);
  const upstream = 'upstreamSha256Url' in source ? await fetchUpstreamSha256(source.upstreamSha256Url) : source.upstreamSha256;
  return { path, upstream };
}

/** Measures every pack (SHA-256, 64 MB chunk hashes) and checks it against the publisher's checksum. */
export async function measurePacks(opts: BuildOptions): Promise<CatalogPack[]> {
  const log = opts.log ?? (() => undefined);
  const packs: CatalogPack[] = [];
  for (const p of opts.manifest.packs) {
    const { path, upstream } = await packFile(p, opts);
    const digest = await digestFile(path);
    if (upstream !== null && upstream !== digest.sha256) {
      throw new Error(`${p.id}: SHA-256 ${digest.sha256} does not match the publisher's ${upstream} (${path})`);
    }
    log(`${p.id}: ${String(digest.sizeBytes)} bytes, sha256 ${digest.sha256}${upstream ? ' (matches upstream)' : ' (local file)'}`);
    packs.push({
      id: p.id,
      kind: p.kind,
      version: p.version,
      file: p.file,
      title: p.title,
      lang: p.lang,
      sizeBytes: digest.sizeBytes,
      sha256: digest.sha256,
      chunkSize: digest.chunkSize,
      chunkSha256: digest.chunkSha256,
      urls: p.urls,
      license: p.license,
      attribution: p.attribution,
      minTier: p.minTier,
      tags: p.tags,
    });
  }
  return packs;
}

/** Serialises a catalog (stable key order, 2-space JSON, trailing newline) and signs the exact bytes. */
export function signCatalog(catalog: Catalog, key: SigningKey): Signed {
  const ordered: Catalog = { schema: CATALOG_SCHEMA, sequence: catalog.sequence, issuedAt: catalog.issuedAt, keyId: key.keyId, packs: catalog.packs };
  parseCatalog(ordered);
  const bytes = utf8(`${JSON.stringify(ordered, null, 2)}\n`);
  return { bytes, signature: signBytes(bytes, key.secretKey) };
}

export async function buildCatalog(opts: BuildOptions): Promise<Signed & { catalog: Catalog }> {
  const sequence = nextSequence(opts.previousSequence, opts.sequence);
  const packs = await measurePacks(opts);
  const catalog: Catalog = {
    schema: CATALOG_SCHEMA,
    sequence,
    issuedAt: opts.issuedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    keyId: opts.key.keyId,
    packs,
  };
  return { ...signCatalog(catalog, opts.key), catalog };
}

/**
 * Key rotation: a key list signed by the key it replaces (or the offline backup). The app accepts
 * it only when the signer is trusted, then trusts exactly the listed keys.
 */
export function signKeyList(list: Omit<KeyList, 'schema' | 'signedBy'>, signer: SigningKey): Signed {
  const ordered: KeyList = { schema: KEY_LIST_SCHEMA, sequence: list.sequence, issuedAt: list.issuedAt, signedBy: signer.keyId, keys: list.keys };
  parseKeyList(ordered);
  const bytes = utf8(`${JSON.stringify(ordered, null, 2)}\n`);
  return { bytes, signature: signBytes(bytes, signer.secretKey) };
}

export async function writeSigned(dir: string, name: string, signed: Signed): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), signed.bytes);
  await writeFile(join(dir, `${name}.sig`), `${signed.signature}\n`, 'utf8');
}

/** Verifies `<dir>/catalog.json` + `.sig` with the given keys (same code as the app). */
export function verifyCatalogDir(dir: string, trusted: readonly TrustedKey[]): ReturnType<typeof verifyCatalog> {
  const bytes = new Uint8Array(readFileSync(join(dir, 'catalog.json')));
  const sig = readFileSync(join(dir, 'catalog.json.sig'), 'utf8');
  return verifyCatalog(bytes, sig, trusted, { sequence: null, sha256: null });
}

export function verifyKeyListDir(dir: string, trusted: readonly TrustedKey[]): ReturnType<typeof verifyKeyList> {
  const bytes = new Uint8Array(readFileSync(join(dir, 'keys.json')));
  const sig = readFileSync(join(dir, 'keys.json.sig'), 'utf8');
  return verifyKeyList(bytes, sig, trusted, { sequence: null, sha256: null });
}
