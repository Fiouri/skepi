import {
  findPackBySha256,
  fromBase64,
  verifyCatalog,
  type Catalog,
  type CatalogPack,
  type CatalogRejection,
  type PackKind,
  type SequenceState,
  type TrustedKey,
} from './catalog';

/**
 * P2P content sharing (docs/architecture.md, "P2P content sharing"). A host serves the packs it
 * selected over HTTPS on the local network (shared LAN or LocalOnlyHotspot); the receiver pairs by
 * QR, pins the host's per-session certificate, and trusts files only through the signed catalog's
 * hashes, never through the host. This module holds everything that does not need a socket: the
 * pairing payload, the manifest, the receiver's catalog and pack decisions, and the chunk loop
 * (the bytes themselves move natively, modules/expo-transfer).
 */
export const TRANSFER_VERSION = 1;
/** Session ends after this long without a request (architecture: 30 minutes idle). */
export const TRANSFER_IDLE_MS = 30 * 60 * 1000;
/** A chunk whose hash does not match is re-requested alone, at most this many times in total. */
export const MAX_CHUNK_ATTEMPTS = 3;

export type TransferErrorCode = 'pairing' | 'manifest' | 'tampered' | 'interrupted' | 'size' | 'cancelled' | 'not_verified';

export class TransferError extends Error {
  constructor(
    readonly code: TransferErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// ---- pairing (QR) ----

/** QR payload: `{ v, ssid?, psk?, host, port, token, certSha256 }`. */
export interface PairingPayload {
  v: typeof TRANSFER_VERSION;
  /** Hotspot mode only: the LocalOnlyHotspot network to join. */
  ssid?: string;
  psk?: string;
  host: string;
  port: number;
  /** 128-bit session token, 32 lowercase hex characters. */
  token: string;
  /** SHA-256 of the host's per-session certificate (DER), 64 lowercase hex characters. */
  certSha256: string;
}

const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Only local-network addresses: RFC 1918, link-local, and IPv6 unique-local / link-local. A QR that
 * points to a public address could make the receiver reach the internet; it is refused.
 */
export function isLocalNetworkAddress(host: string): boolean {
  const m = host.match(IPV4);
  if (m) {
    const [a, b, c, d] = m.slice(1, 5).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((x) => x > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const v6 = host.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(v6) || !v6.includes(':')) return false;
  return /^f[cd][0-9a-f]{0,2}:/.test(v6) || /^fe[89ab][0-9a-f]?:/.test(v6);
}

const PAIRING_KEYS = ['v', 'ssid', 'psk', 'host', 'port', 'token', 'certSha256'] as const;

/** Parses and validates a scanned (or typed) pairing payload; throws TransferError('pairing'). */
export function parsePairing(text: string): PairingPayload {
  let data: unknown;
  try {
    data = JSON.parse(text.trim()) as unknown;
  } catch {
    throw new TransferError('pairing', 'not a SKEPI pairing code');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new TransferError('pairing', 'not a SKEPI pairing code');
  const o = data as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !(PAIRING_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) throw new TransferError('pairing', `unexpected field(s) ${extra.join(', ')}`);
  if (o.v !== TRANSFER_VERSION) throw new TransferError('pairing', `unsupported version ${String(o.v)}`);
  if (typeof o.host !== 'string' || !isLocalNetworkAddress(o.host)) throw new TransferError('pairing', 'host must be a local network address');
  if (typeof o.port !== 'number' || !Number.isInteger(o.port) || o.port < 1024 || o.port > 65535) throw new TransferError('pairing', 'invalid port');
  if (typeof o.token !== 'string' || !HEX32.test(o.token)) throw new TransferError('pairing', 'invalid session token');
  if (typeof o.certSha256 !== 'string' || !HEX64.test(o.certSha256)) throw new TransferError('pairing', 'invalid certificate fingerprint');
  const out: PairingPayload = { v: TRANSFER_VERSION, host: o.host, port: o.port, token: o.token, certSha256: o.certSha256 };
  if (o.ssid !== undefined || o.psk !== undefined) {
    if (typeof o.ssid !== 'string' || o.ssid.length === 0 || new TextEncoder().encode(o.ssid).length > 32) throw new TransferError('pairing', 'invalid hotspot name');
    if (typeof o.psk !== 'string' || o.psk.length < 8 || o.psk.length > 63) throw new TransferError('pairing', 'invalid hotspot password');
    out.ssid = o.ssid;
    out.psk = o.psk;
  }
  return out;
}

/** Compact JSON for the QR code (keys in a fixed order). */
export function encodePairing(p: PairingPayload): string {
  const ordered: Record<string, unknown> = { v: p.v };
  if (p.ssid !== undefined) ordered.ssid = p.ssid;
  if (p.psk !== undefined) ordered.psk = p.psk;
  Object.assign(ordered, { host: p.host, port: p.port, token: p.token, certSha256: p.certSha256 });
  return JSON.stringify(ordered);
}

// ---- manifest (GET /manifest) ----

/** What the host offers for one pack. Only the catalog decides whether it is trusted. */
export interface OfferedPack {
  id: string;
  kind: PackKind;
  version: string;
  title: string;
  sizeBytes: number;
  sha256: string;
}

export interface TransferManifest {
  v: typeof TRANSFER_VERSION;
  /** The host's newest accepted signed catalog (exact bytes, base64) and its signature. */
  catalog: { bytes: string; signature: string } | null;
  packs: OfferedPack[];
}

/** The host's installed pack, as far as the manifest needs it. */
export interface ShareablePack {
  id: string;
  kind: PackKind;
  version: string;
  title: string;
  sizeBytes: number;
  sha256: string;
  /** Unverified packs other than ZIM are never shared (no receiver could accept them). */
  verified: boolean;
}

/**
 * The manifest of a session: exactly the packs the host selected (and never anything else; user
 * data has no representation here), plus the host's signed catalog for propagation.
 */
export function buildManifest(
  selected: readonly ShareablePack[],
  catalog: { bytes: Uint8Array; signature: string } | null,
  toBase64: (b: Uint8Array) => string,
): TransferManifest {
  const ids = new Set<string>();
  const packs: OfferedPack[] = [];
  for (const p of selected) {
    if (ids.has(p.id)) continue;
    if (!p.verified && p.kind !== 'zim') continue;
    ids.add(p.id);
    packs.push({ id: p.id, kind: p.kind, version: p.version, title: p.title, sizeBytes: p.sizeBytes, sha256: p.sha256 });
  }
  return { v: TRANSFER_VERSION, catalog: catalog ? { bytes: toBase64(catalog.bytes), signature: catalog.signature } : null, packs };
}

const PACK_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const KINDS: readonly PackKind[] = ['zim', 'gguf', 'pmtiles', 'places'];
const MAX_MANIFEST_PACKS = 256;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function manifestError(why: string): TransferError {
  return new TransferError('manifest', why);
}

function parseOffer(raw: unknown, i: number, seen: Set<string>): OfferedPack {
  const at = `packs[${String(i)}]`;
  if (!isObject(raw)) throw manifestError(`${at} is not an object`);
  const kind = KINDS.find((k) => k === raw.kind);
  const { id, version, title, sizeBytes, sha256 } = raw;
  if (typeof id !== 'string' || !PACK_ID.test(id) || seen.has(id)) throw manifestError(`${at}.id invalid`);
  if (!kind) throw manifestError(`${at}.kind invalid`);
  if (typeof version !== 'string' || version.length === 0 || version.length > 64) throw manifestError(`${at}.version invalid`);
  if (typeof title !== 'string' || title.length > 200) throw manifestError(`${at}.title invalid`);
  if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) throw manifestError(`${at}.sizeBytes invalid`);
  if (typeof sha256 !== 'string' || !HEX64.test(sha256)) throw manifestError(`${at}.sha256 invalid`);
  seen.add(id);
  return { id, kind, version, title, sizeBytes, sha256 };
}

/** Strict parse of a host manifest (untrusted input). */
export function parseManifest(text: string): TransferManifest {
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw manifestError('manifest is not JSON');
  }
  if (!isObject(data)) throw manifestError('manifest is not an object');
  if (data.v !== TRANSFER_VERSION) throw manifestError(`unsupported manifest version ${String(data.v)}`);
  let catalog: TransferManifest['catalog'] = null;
  if (data.catalog !== null && data.catalog !== undefined) {
    const c = data.catalog;
    if (!isObject(c) || typeof c.bytes !== 'string' || typeof c.signature !== 'string') throw manifestError('invalid catalog');
    catalog = { bytes: c.bytes, signature: c.signature };
  }
  if (!Array.isArray(data.packs) || data.packs.length > MAX_MANIFEST_PACKS) throw manifestError('invalid pack list');
  const seen = new Set<string>();
  const packs = (data.packs as unknown[]).map((raw, i) => parseOffer(raw, i, seen));
  return { v: TRANSFER_VERSION, catalog, packs };
}

// ---- receiver: catalog propagation ----

export type HostCatalogDecision =
  /** Valid signature and a higher sequence: adopted (catalogs propagate phone to phone). */
  | { kind: 'adopt'; catalog: Catalog; sequence: number; sha256: string; bytes: Uint8Array; signature: string }
  /** The same catalog the receiver already holds. */
  | { kind: 'same'; sequence: number }
  /** Not used: no catalog, a bad signature, an unknown key, a lower sequence or a malformed one. */
  | { kind: 'rejected'; reason: CatalogRejection | 'none'; detail: string };

/**
 * Decides on the host's catalog with the receiver's trusted keys and anti-rollback state. Nothing in
 * the host's catalog is used unless its signature verifies (verifyCatalog checks the exact bytes).
 */
export function evaluateHostCatalog(offered: TransferManifest['catalog'], trusted: readonly TrustedKey[], state: SequenceState): HostCatalogDecision {
  if (!offered) return { kind: 'rejected', reason: 'none', detail: 'the host sent no catalog' };
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(offered.bytes);
  } catch {
    return { kind: 'rejected', reason: 'malformed', detail: 'catalog bytes are not base64' };
  }
  const r = verifyCatalog(bytes, offered.signature, trusted, state);
  if (!r.ok) return { kind: 'rejected', reason: r.reason, detail: r.detail };
  if (state.sequence !== null && r.sequence === state.sequence) return { kind: 'same', sequence: r.sequence };
  return { kind: 'adopt', catalog: r.value, sequence: r.sequence, sha256: r.sha256, bytes, signature: offered.signature };
}

// ---- receiver: which packs to take ----

export type OfferStatus =
  /** In the receiver's (possibly just updated) signed catalog with the same hash, size and kind. */
  | 'verified'
  /** Already installed with this hash. */
  | 'installed'
  /** Not in any valid catalog: only a ZIM may be taken, by explicit choice, and stays labelled. */
  | 'unverified'
  /** Not in any valid catalog and not a ZIM: never accepted (models, maps, places). */
  | 'refused';

export interface OfferDecision {
  offer: OfferedPack;
  status: OfferStatus;
  /** The catalog entry the bytes are checked against (verified only). */
  entry: CatalogPack | null;
  /** Pre-selected for download: verified and not installed. Unverified is never auto-selected. */
  autoSelect: boolean;
}

export function classifyOffers(manifest: TransferManifest, catalog: Catalog | null, installed: readonly { sha256: string }[]): OfferDecision[] {
  const have = new Set(installed.map((p) => p.sha256));
  return manifest.packs.map((offer): OfferDecision => {
    const entry = catalog ? findPackBySha256(catalog, offer.sha256) : null;
    const matches = entry !== null && entry.sizeBytes === offer.sizeBytes && entry.kind === offer.kind;
    if (have.has(offer.sha256)) return { offer, status: 'installed', entry: matches ? entry : null, autoSelect: false };
    if (matches) return { offer, status: 'verified', entry, autoSelect: true };
    return { offer, status: offer.kind === 'zim' ? 'unverified' : 'refused', entry: null, autoSelect: false };
  });
}

// ---- receiver: chunk loop ----

export interface ChunkResult {
  /** SHA-256 of the bytes written for this chunk (computed natively while writing). */
  sha256: string;
  bytes: number;
}

/**
 * Native side of one chunk: `GET /pack/:id` with `Range: bytes=offset-(offset+length-1)`, written to
 * the partial file at `offset`. Throws on network errors (the transfer is then resumable).
 */
export type FetchChunk = (index: number, offset: number, length: number) => Promise<ChunkResult>;

export type ReceiveEvent =
  | { type: 'chunk'; index: number; total: number; bytes: number }
  | { type: 'chunk-rejected'; index: number; attempt: number; expected: string; got: string }
  | { type: 'resumed'; fromChunk: number; total: number };

export interface ReceiveOptions {
  /** Chunks already on disk and verified (the matching prefix of the partial file). */
  startChunk: number;
  maxAttempts?: number;
  onEvent?: (e: ReceiveEvent) => void;
  signal?: AbortSignal;
}

export interface ReceiveSummary {
  chunks: number;
  rerequested: number;
  resumedFrom: number;
}

export function chunkCount(entry: Pick<CatalogPack, 'sizeBytes' | 'chunkSize'>): number {
  return Math.ceil(entry.sizeBytes / entry.chunkSize);
}

export function chunkRange(entry: Pick<CatalogPack, 'sizeBytes' | 'chunkSize'>, index: number): { offset: number; length: number } {
  const offset = index * entry.chunkSize;
  return { offset, length: Math.min(entry.chunkSize, entry.sizeBytes - offset) };
}

/**
 * Number of leading chunks of a partial file that match the catalog (resume point). `onDisk` are the
 * chunk hashes of the partial file as it is now (native hash with the catalog's chunk size); a chunk
 * counts only when it is complete on disk and its hash matches.
 */
export function verifiedPrefix(entry: Pick<CatalogPack, 'sizeBytes' | 'chunkSize' | 'chunkSha256'>, onDisk: readonly string[], partialBytes: number): number {
  let n = 0;
  while (n < onDisk.length && n < entry.chunkSha256.length) {
    const { offset, length } = chunkRange(entry, n);
    if (offset + length > partialBytes) break;
    if (onDisk[n] !== entry.chunkSha256[n]) break;
    n += 1;
  }
  return n;
}

/**
 * Receives one verified pack chunk by chunk: every chunk is checked against the catalog's
 * `chunkSha256` as it arrives; a bad chunk is re-requested alone (up to `maxAttempts` in total); a
 * chunk that never matches rejects the pack ('tampered'). A network error stops with 'interrupted'
 * and the verified prefix stays on disk for a resume. The caller then hashes the whole file and
 * installs it atomically, exactly like a download.
 */
export async function receiveChunks(entry: CatalogPack, fetchChunk: FetchChunk, opts: ReceiveOptions): Promise<ReceiveSummary> {
  const total = chunkCount(entry);
  if (entry.chunkSha256.length !== total) throw new TransferError('not_verified', `${entry.id}: catalog chunk list does not match its size`);
  const maxAttempts = opts.maxAttempts ?? MAX_CHUNK_ATTEMPTS;
  const start = Math.max(0, Math.min(opts.startChunk, total));
  if (start > 0) opts.onEvent?.({ type: 'resumed', fromChunk: start, total });
  let rerequested = 0;
  for (let index = start; index < total; index += 1) {
    const { offset, length } = chunkRange(entry, index);
    const expected = entry.chunkSha256[index] ?? '';
    let ok = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (opts.signal?.aborted) throw new TransferError('cancelled', 'cancelled');
      let r: ChunkResult;
      try {
        r = await fetchChunk(index, offset, length);
      } catch (e) {
        throw new TransferError('interrupted', `chunk ${String(index)}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (r.bytes === length && r.sha256 === expected) {
        ok = true;
        break;
      }
      opts.onEvent?.({ type: 'chunk-rejected', index, attempt, expected, got: r.bytes === length ? r.sha256 : `${String(r.bytes)} bytes` });
      if (attempt < maxAttempts) rerequested += 1;
    }
    if (!ok) throw new TransferError('tampered', `${entry.id}: chunk ${String(index)} never matched the signed catalog`);
    opts.onEvent?.({ type: 'chunk', index, total, bytes: offset + length });
  }
  return { chunks: total, rerequested, resumedFrom: start };
}
