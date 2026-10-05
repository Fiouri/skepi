import { isAllowedDownloadUrl, type CatalogPack } from '@skepi/core';
import { readFileSync } from 'node:fs';

/**
 * Packs manifest (catalog/manifest.json, catalog/test-manifest.json): everything the catalog says
 * about a pack except what the builder measures (size, SHA-256, chunk hashes).
 */
export type ManifestPack = Omit<CatalogPack, 'sizeBytes' | 'sha256' | 'chunkSize' | 'chunkSha256'> & {
  /** Where the builder gets the bytes and how it checks them against the publisher. */
  source: PackSource;
};

export type PackSource =
  /** Official download; `upstreamSha256Url` is the publisher's checksum file (Kiwix `.sha256`). */
  | { kind: 'download'; url: string; upstreamSha256Url: string }
  /** Official download whose publisher lists the SHA-256 elsewhere (Hugging Face LFS oid), pinned here. */
  | { kind: 'download'; url: string; upstreamSha256: string; upstreamSha256From: string }
  /** A file in this repository (test packs for the local mirror). */
  | { kind: 'local'; path: string };

export interface Manifest {
  schema: 1;
  description?: string;
  packs: ManifestPack[];
}

function fail(msg: string): never {
  throw new Error(`manifest: ${msg}`);
}

export function parseManifest(text: string): Manifest {
  const data = JSON.parse(text) as Partial<Manifest>;
  if (data.schema !== 1 || !Array.isArray(data.packs)) fail('expected { schema: 1, packs: [] }');
  for (const p of data.packs) {
    if (typeof p.id !== 'string') fail('pack without id');
    const s = p.source as Partial<Record<string, unknown>> | undefined;
    if (!s || (s.kind !== 'download' && s.kind !== 'local')) fail(`${p.id}: source.kind must be download or local`);
    if (s.kind === 'download') {
      if (typeof s.url !== 'string' || !s.url.startsWith('https://')) fail(`${p.id}: source.url must be HTTPS`);
      const pinned = typeof s.upstreamSha256 === 'string' && /^[0-9a-f]{64}$/.test(s.upstreamSha256);
      if (typeof s.upstreamSha256Url !== 'string' && !pinned) fail(`${p.id}: an upstream checksum (upstreamSha256Url or upstreamSha256) is required`);
    } else if (typeof s.path !== 'string') {
      fail(`${p.id}: source.path required`);
    }
    if (!Array.isArray(p.urls) || p.urls.length === 0 || !p.urls.every((u) => typeof u === 'string' && isAllowedDownloadUrl(u))) {
      fail(`${p.id}: urls must be HTTPS without query strings`);
    }
  }
  return data as Manifest;
}

export function readManifest(path: string): Manifest {
  return parseManifest(readFileSync(path, 'utf8'));
}

/** Several manifests in one catalog (the debug catalog = official packs + test packs). */
export function mergeManifests(manifests: readonly Manifest[]): Manifest {
  if (manifests.length === 0) fail('at least one --manifest is required');
  const packs = manifests.flatMap((m) => m.packs);
  const ids = new Set<string>();
  for (const p of packs) {
    if (ids.has(p.id)) fail(`duplicate pack id ${p.id}`);
    ids.add(p.id);
  }
  return { schema: 1, packs };
}
