import {
  fromBase64,
  NO_SEQUENCE,
  pinnedKeys,
  toBase64,
  trustedFromPinned,
  verifyCatalog,
  type Catalog,
  type CatalogRejection,
  type PinnedKeyInput,
  type TrustedKey,
} from '@skepi/core';
import { getSetting, setSetting, type SqlDatabase } from '@skepi/db';

/** Raw catalog material as read from the APK or app storage (bytes are verified, never re-serialised). */
export interface CatalogSource {
  origin: 'embedded' | 'stored' | 'update';
  bytes: Uint8Array;
  signature: string;
}

export interface CatalogRejectionReport {
  origin: CatalogSource['origin'];
  reason: CatalogRejection;
  detail: string;
}

export interface CatalogState {
  catalog: Catalog | null;
  origin: CatalogSource['origin'] | null;
  sha256: string | null;
  /** `release` or `test` (debug builds): which pinned keys this build trusts. */
  purpose: 'release' | 'test' | null;
  trusted: TrustedKey[];
  rejected: CatalogRejectionReport[];
  /** Base URLs serving catalog.json(.sig) for "Check for catalog update" (debug: local mirror). */
  updateUrls: string[];
}

export interface PinnedKeysFile {
  schema: 1;
  purpose: 'release' | 'test';
  active: PinnedKeyInput;
  backup: PinnedKeyInput;
}

export function parsePinnedKeysFile(text: string): PinnedKeysFile {
  const data = JSON.parse(text) as Partial<PinnedKeysFile>;
  if (data.schema !== 1 || (data.purpose !== 'release' && data.purpose !== 'test') || !data.active || !data.backup) {
    throw new Error('embedded keys.json is not a pinned keys file');
  }
  return data as PinnedKeysFile;
}

export function parseUpdateUrls(text: string | null): string[] {
  if (!text) return [];
  const data = JSON.parse(text) as { updateUrls?: unknown };
  return Array.isArray(data.updateUrls) ? data.updateUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('https://')) : [];
}

/**
 * Trusted keys: the pinned pair, unless a key list signed by a trusted key was accepted earlier
 * (rotation); then exactly the keys of that list.
 */
export async function trustedKeys(db: SqlDatabase, pinned: PinnedKeysFile): Promise<TrustedKey[]> {
  const rotated = await getSetting(db, 'catalog.keyList');
  if (rotated && rotated.keys.length > 0) {
    return rotated.keys.map((k) => ({ keyId: k.keyId, publicKey: fromBase64(k.publicKey) }));
  }
  return trustedFromPinned(pinnedKeys(pinned));
}

/**
 * Chooses the newest valid catalog among the given sources, with anti-rollback against the highest
 * sequence this device accepted (stored in app.db). A newer accepted catalog is recorded; nothing
 * that fails verification is ever used.
 */
export async function selectCatalog(
  db: SqlDatabase,
  sources: readonly CatalogSource[],
  trusted: readonly TrustedKey[],
): Promise<Pick<CatalogState, 'catalog' | 'origin' | 'sha256' | 'rejected'> & { accepted: CatalogSource | null }> {
  const state = (await getSetting(db, 'catalog.accepted')) ?? NO_SEQUENCE;
  const rejected: CatalogRejectionReport[] = [];
  let best: { source: CatalogSource; catalog: Catalog; sha256: string } | null = null;
  for (const source of sources) {
    const r = verifyCatalog(source.bytes, source.signature, trusted, state);
    if (!r.ok) {
      rejected.push({ origin: source.origin, reason: r.reason, detail: r.detail });
      continue;
    }
    if (!best || r.sequence > best.catalog.sequence) best = { source, catalog: r.value, sha256: r.sha256 };
  }
  if (!best) return { catalog: null, origin: null, sha256: null, rejected, accepted: null };
  if (state.sequence === null || best.catalog.sequence > state.sequence) {
    await setSetting(db, 'catalog.accepted', { sequence: best.catalog.sequence, sha256: best.sha256 });
  }
  return { catalog: best.catalog, origin: best.source.origin, sha256: best.sha256, rejected, accepted: best.source };
}

export function sourceFromBase64(origin: CatalogSource['origin'], catalogBase64: string, signature: string): CatalogSource {
  return { origin, bytes: fromBase64(catalogBase64), signature };
}

export function sourceToBase64(source: CatalogSource): string {
  return toBase64(source.bytes);
}
