import { isAllowedDownloadUrl, type CatalogPack } from '@skepi/core';
import { readFileSync } from 'node:fs';

/**
 * Packs manifest (catalog/manifest.json, catalog/test-manifest.json): everything the catalog says
 * about a pack except what the builder measures (size, SHA-256, chunk hashes).
 */
export type ManifestPack = Omit<CatalogPack, 'sizeBytes' | 'sha256' | 'chunkSize' | 'chunkSha256'> & {
  /** Where the builder gets the bytes and how it checks them against the publisher. */
  source: PackSource;
  /**
   * Chunk size of `chunkSha256` (default 64 MiB). Smaller only for test packs, so a small file has
   * several chunks for the P2P chunk tests.
   */
  chunkSize?: number;
};

export type PackSource =
  /** Official download; `upstreamSha256Url` is the publisher's checksum file (Kiwix `.sha256`). */
  | { kind: 'download'; url: string; upstreamSha256Url: string }
  /** Official download whose publisher lists the SHA-256 elsewhere (Hugging Face LFS oid), pinned here. */
  | { kind: 'download'; url: string; upstreamSha256: string; upstreamSha256From: string }
  /** A file in this repository (test packs for the local mirror). */
  | { kind: 'local'; path: string }
  /**
   * Built here: `pmtiles extract` of a pinned Protomaps daily build (daily builds expire, so the
   * extract is kept in the cache and mirrored by us) over a region GeoJSON in this repository.
   */
  | { kind: 'pmtiles-extract'; buildUrl: string; region: string; maxzoom: number }
  /**
   * Built here: places pack (SQLite FTS5) from a dated OpenStreetMap extract; `upstreamMd5Url` is the
   * publisher's checksum (Geofabrik `.md5`).
   */
  | { kind: 'osm-places'; url: string; upstreamMd5Url: string; region: string; locale: string };

/** Chunk sizes allowed in a manifest: powers of two from 64 KiB to 64 MiB. */
export function isAllowedChunkSize(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 64 * 1024 && n <= 64 * 1024 * 1024 && (n & (n - 1)) === 0;
}

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
    if (!s || !['download', 'local', 'pmtiles-extract', 'osm-places'].includes(String(s.kind))) {
      fail(`${p.id}: source.kind must be download, local, pmtiles-extract or osm-places`);
    }
    if (s.kind === 'download') {
      if (typeof s.url !== 'string' || !s.url.startsWith('https://')) fail(`${p.id}: source.url must be HTTPS`);
      const pinned = typeof s.upstreamSha256 === 'string' && /^[0-9a-f]{64}$/.test(s.upstreamSha256);
      if (typeof s.upstreamSha256Url !== 'string' && !pinned) fail(`${p.id}: an upstream checksum (upstreamSha256Url or upstreamSha256) is required`);
    } else if (s.kind === 'pmtiles-extract') {
      if (p.kind !== 'pmtiles') fail(`${p.id}: pmtiles-extract builds kind pmtiles`);
      if (typeof s.buildUrl !== 'string' || !/^https:\/\/build\.protomaps\.com\/\d{8}\.pmtiles$/.test(s.buildUrl)) fail(`${p.id}: buildUrl must be a dated Protomaps build`);
      if (typeof s.region !== 'string' || !s.region.endsWith('.geojson')) fail(`${p.id}: region must be a .geojson file`);
      if (typeof s.maxzoom !== 'number' || !Number.isInteger(s.maxzoom) || s.maxzoom < 0 || s.maxzoom > 15) fail(`${p.id}: maxzoom 0..15`);
    } else if (s.kind === 'osm-places') {
      if (p.kind !== 'places') fail(`${p.id}: osm-places builds kind places`);
      if (typeof s.url !== 'string' || !s.url.startsWith('https://') || !s.url.endsWith('.osm.pbf')) fail(`${p.id}: source.url must be an HTTPS .osm.pbf`);
      if (typeof s.upstreamMd5Url !== 'string' || !s.upstreamMd5Url.startsWith('https://')) fail(`${p.id}: upstreamMd5Url required`);
      if (typeof s.region !== 'string' || !/^[A-Z]{2}$/.test(s.region)) fail(`${p.id}: region must be ISO 3166-1 alpha-2`);
      if (typeof s.locale !== 'string' || !/^[a-z]{2,3}$/.test(s.locale)) fail(`${p.id}: locale must be a language code`);
    } else if (typeof s.path !== 'string') {
      fail(`${p.id}: source.path required`);
    }
    if (p.chunkSize !== undefined && !isAllowedChunkSize(p.chunkSize)) fail(`${p.id}: chunkSize must be a power of two from 64 KiB to 64 MiB`);
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
