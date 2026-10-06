import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  chunkCount,
  classifyOffers,
  encodePairing,
  evaluateHostCatalog,
  generateKeyPair,
  isLocalNetworkAddress,
  NO_SEQUENCE,
  parseManifest,
  parsePairing,
  pinnedKeys,
  receiveChunks,
  sha256Hex,
  signBytes,
  toBase64,
  toHex,
  TransferError,
  trustedFromPinned,
  utf8,
  verifiedPrefix,
  type Catalog,
  type CatalogPack,
  type ReceiveEvent,
  type ShareablePack,
} from '../src';

// ---- fixtures: a real multi-chunk pack and catalogs signed with test keys ----

const CHUNK = 64 * 1024;
const PACK_BYTES = new Uint8Array(CHUNK * 3 + 1000).map((_, i) => (i * 31 + 7) % 251);
const hex = (b: Uint8Array): string => toHex(sha256(b));
const chunks = (bytes: Uint8Array): string[] => {
  const out: string[] = [];
  for (let o = 0; o < bytes.length; o += CHUNK) out.push(hex(bytes.subarray(o, o + CHUNK)));
  return out;
};

function pack(over: Partial<CatalogPack> = {}): CatalogPack {
  return {
    id: 'test-smoke-en',
    kind: 'zim',
    version: '1',
    file: 'eval-smoke-en.zim',
    title: { en: 'Test pack' },
    lang: ['en'],
    sizeBytes: PACK_BYTES.length,
    sha256: hex(PACK_BYTES),
    chunkSize: CHUNK,
    chunkSha256: chunks(PACK_BYTES),
    urls: ['https://127.0.0.1:8443/packs/eval-smoke-en.zim'],
    license: 'CC0-1.0',
    attribution: 'SKEPI',
    minTier: 'T0',
    tags: ['test'],
    ...over,
  };
}

const keyA = generateKeyPair();
const keyB = generateKeyPair();
const rogue = generateKeyPair();
const trusted = trustedFromPinned(
  pinnedKeys({ active: { keyId: 'cat-test-a', publicKey: toBase64(keyA.publicKey) }, backup: { keyId: 'cat-test-b', publicKey: toBase64(keyB.publicKey) } }),
);

function signed(sequence: number, packs: CatalogPack[], secret = keyA.secretKey): { bytes: Uint8Array; signature: string; catalog: Catalog } {
  const catalog: Catalog = { schema: 1, sequence, issuedAt: '2026-10-06T00:00:00Z', keyId: 'cat-test-a', packs };
  const bytes = utf8(`${JSON.stringify(catalog, null, 2)}\n`);
  return { bytes, signature: signBytes(bytes, secret), catalog };
}

const PAIRING = { v: 1 as const, host: '192.168.49.1', port: 43211, token: '0123456789abcdef0123456789abcdef', certSha256: 'ab'.repeat(32) };

describe('pairing payload (QR)', () => {
  it('round-trips LAN and hotspot payloads', () => {
    expect(parsePairing(encodePairing(PAIRING))).toEqual(PAIRING);
    const hotspot = { ...PAIRING, ssid: 'AndroidShare_1234', psk: 'k3y-for-this-session' };
    expect(parsePairing(encodePairing(hotspot))).toEqual(hotspot);
    expect(encodePairing(hotspot)).toBe(
      '{"v":1,"ssid":"AndroidShare_1234","psk":"k3y-for-this-session","host":"192.168.49.1","port":43211,"token":"0123456789abcdef0123456789abcdef","certSha256":"' +
        'ab'.repeat(32) +
        '"}',
    );
  });

  it('requires a 128-bit token, a SHA-256 pin and a local address', () => {
    const bad = (over: Record<string, unknown>): (() => void) => () => parsePairing(JSON.stringify({ ...PAIRING, ...over }));
    expect(bad({ token: 'abc' })).toThrow(TransferError);
    expect(bad({ token: '0123456789ABCDEF0123456789ABCDEF' })).toThrow(/token/);
    expect(bad({ certSha256: 'ab'.repeat(31) })).toThrow(/fingerprint/);
    expect(bad({ host: '8.8.8.8' })).toThrow(/local network/);
    expect(bad({ host: 'example.com' })).toThrow(/local network/);
    expect(bad({ port: 80 })).toThrow(/port/);
    expect(bad({ v: 2 })).toThrow(/version/);
    expect(bad({ extra: 1 })).toThrow(/unexpected/);
    expect(bad({ ssid: 'x' })).toThrow(/password/);
    expect(bad({ ssid: 'x', psk: 'short' })).toThrow(/password/);
    expect(() => parsePairing('https://evil.example/')).toThrow(/pairing code/);
  });

  it('accepts only local network addresses', () => {
    for (const ok of ['10.0.2.2', '172.16.0.1', '172.31.255.254', '192.168.1.5', '169.254.3.4', 'fe80::1', 'fd12:3456::1']) expect(isLocalNetworkAddress(ok), ok).toBe(true);
    for (const no of ['8.8.8.8', '172.32.0.1', '100.64.0.1', '127.0.0.1', '0.0.0.0', '256.1.1.1', '2001:db8::1', '::1', 'localhost']) expect(isLocalNetworkAddress(no), no).toBe(false);
  });
});

describe('manifest', () => {
  const installed: ShareablePack[] = [
    { id: 'test-smoke-en', kind: 'zim', version: '1', title: 'Test pack', sizeBytes: PACK_BYTES.length, sha256: hex(PACK_BYTES), verified: true },
    { id: 'import-abc', kind: 'zim', version: 'unverified', title: 'My ZIM', sizeBytes: 10, sha256: 'c'.repeat(64), verified: false },
    { id: 'rogue-model', kind: 'gguf', version: 'x', title: 'Model', sizeBytes: 10, sha256: 'd'.repeat(64), verified: false },
    { id: 'places-gr', kind: 'places', version: '2026-10-04', title: 'Places', sizeBytes: 10, sha256: 'e'.repeat(64), verified: true },
  ];

  it('lists exactly the selected packs, never unverified non-ZIM files', () => {
    const m = buildManifest(installed.slice(0, 3), null, toBase64);
    expect(m.packs.map((p) => p.id)).toEqual(['test-smoke-en', 'import-abc']);
    expect(buildManifest([], null, toBase64).packs).toEqual([]);
    expect(JSON.stringify(m)).not.toMatch(/path|notes|conversation|settings/);
  });

  it('round-trips and rejects malformed manifests', () => {
    const cat = signed(3, [pack()]);
    const m = buildManifest(installed.slice(0, 1), cat, toBase64);
    expect(parseManifest(JSON.stringify(m))).toEqual(m);
    const bad = (over: unknown): (() => void) => () => parseManifest(JSON.stringify(over));
    expect(bad({ ...m, v: 9 })).toThrow(/version/);
    expect(bad({ ...m, packs: [{ ...m.packs[0], id: '../app.db' }] })).toThrow(/id/);
    expect(bad({ ...m, packs: [{ ...m.packs[0], sha256: 'zz' }] })).toThrow(/sha256/);
    expect(bad({ ...m, packs: [m.packs[0], m.packs[0]] })).toThrow(/id/);
    expect(bad({ ...m, catalog: { bytes: 1 } })).toThrow(/catalog/);
    expect(() => parseManifest('not json')).toThrow(/JSON/);
  });
});

describe('catalog propagation', () => {
  const current = signed(3, [pack()]);
  const state = { sequence: 3, sha256: sha256Hex(current.bytes) };
  const offer = (c: { bytes: Uint8Array; signature: string }): { bytes: string; signature: string } => ({ bytes: toBase64(c.bytes), signature: c.signature });

  it('adopts a newer catalog with a valid signature', () => {
    const newer = signed(4, [pack(), pack({ id: 'test-propagation', file: 'p.zim', sha256: 'f'.repeat(64) })]);
    const d = evaluateHostCatalog(offer(newer), trusted, state);
    expect(d.kind).toBe('adopt');
    if (d.kind === 'adopt') expect(d.sequence).toBe(4);
  });

  it('keeps the same catalog and rejects a lower sequence', () => {
    expect(evaluateHostCatalog(offer(current), trusted, state)).toEqual({ kind: 'same', sequence: 3 });
    expect(evaluateHostCatalog(offer(signed(2, [pack()])), trusted, state)).toMatchObject({ kind: 'rejected', reason: 'rollback' });
    // Same sequence, other bytes: sequence reuse.
    expect(evaluateHostCatalog(offer(signed(3, [])), trusted, state)).toMatchObject({ kind: 'rejected', reason: 'sequence_reuse' });
  });

  it('rejects a bad signature, an unknown key and a tampered byte', () => {
    const newer = signed(4, [pack()]);
    expect(evaluateHostCatalog({ ...offer(newer), signature: signBytes(newer.bytes, rogue.secretKey) }, trusted, state)).toMatchObject({
      kind: 'rejected',
      reason: 'bad_signature',
    });
    const tampered = new Uint8Array(newer.bytes);
    tampered[40] = (tampered[40] ?? 0) ^ 1;
    expect(evaluateHostCatalog({ bytes: toBase64(tampered), signature: newer.signature }, trusted, state).kind).toBe('rejected');
    expect(evaluateHostCatalog(null, trusted, state)).toMatchObject({ kind: 'rejected', reason: 'none' });
    expect(evaluateHostCatalog({ bytes: '!!', signature: newer.signature }, trusted, NO_SEQUENCE)).toMatchObject({ reason: 'malformed' });
  });
});

describe('offers', () => {
  const entry = pack();
  const catalog = signed(4, [entry]).catalog;
  const m = (packs: ShareablePack[]): ReturnType<typeof buildManifest> => buildManifest(packs, null, toBase64);
  const offered: ShareablePack = { id: entry.id, kind: 'zim', version: '1', title: 'x', sizeBytes: entry.sizeBytes, sha256: entry.sha256, verified: true };

  it('pre-selects only verified packs that are not installed', () => {
    const [d] = classifyOffers(m([offered]), catalog, []);
    expect(d).toMatchObject({ status: 'verified', autoSelect: true });
    expect(d?.entry?.chunkSha256).toEqual(entry.chunkSha256);
    expect(classifyOffers(m([offered]), catalog, [{ sha256: entry.sha256 }])[0]).toMatchObject({ status: 'installed', autoSelect: false });
  });

  it('never trusts the host: unknown hash, wrong size or kind is unverified (ZIM) or refused', () => {
    const unknown = { ...offered, id: 'other', sha256: '9'.repeat(64) };
    expect(classifyOffers(m([unknown]), catalog, [])[0]).toMatchObject({ status: 'unverified', autoSelect: false, entry: null });
    expect(classifyOffers(m([{ ...offered, sizeBytes: 5 }]), catalog, [])[0]).toMatchObject({ status: 'unverified', autoSelect: false });
    expect(classifyOffers(m([{ ...unknown, kind: 'pmtiles', verified: true }]), catalog, [])[0]).toMatchObject({ status: 'refused' });
    expect(classifyOffers(m([offered]), null, [])[0]).toMatchObject({ status: 'unverified' });
  });
});

describe('receiveChunks', () => {
  const entry = pack();
  const total = chunkCount(entry);

  /** A host serving the pack's bytes, with optional faults; `disk` is the receiver's partial file. */
  function host(faults: { corruptOnce?: number; corruptAlways?: number; dropAt?: number | undefined } = {}): {
    fetch: (index: number, offset: number, length: number) => Promise<{ sha256: string; bytes: number }>;
    disk: Uint8Array;
    requests: number[];
  } {
    const disk = new Uint8Array(PACK_BYTES.length);
    const requests: number[] = [];
    let corrupted = false;
    return {
      disk,
      requests,
      fetch: (index, offset, length) => {
        requests.push(index);
        if (faults.dropAt === index) {
          faults.dropAt = undefined;
          return Promise.reject(new Error('connection reset'));
        }
        const bytes = PACK_BYTES.slice(offset, offset + length);
        if (faults.corruptAlways === index || (faults.corruptOnce === index && !corrupted)) {
          corrupted = true;
          bytes[10] = (bytes[10] ?? 0) ^ 0xff;
        }
        disk.set(bytes, offset);
        return Promise.resolve({ sha256: hex(bytes), bytes: bytes.length });
      },
    };
  }

  it('verifies every chunk on arrival', async () => {
    const h = host();
    const events: ReceiveEvent[] = [];
    const r = await receiveChunks(entry, h.fetch, { startChunk: 0, onEvent: (e) => events.push(e) });
    expect(r).toEqual({ chunks: total, rerequested: 0, resumedFrom: 0 });
    expect(hex(h.disk)).toBe(entry.sha256);
    expect(events.filter((e) => e.type === 'chunk')).toHaveLength(total);
  });

  it('re-requests a corrupted chunk alone', async () => {
    const h = host({ corruptOnce: 2 });
    const events: ReceiveEvent[] = [];
    const r = await receiveChunks(entry, h.fetch, { startChunk: 0, onEvent: (e) => events.push(e) });
    expect(r.rerequested).toBe(1);
    expect(h.requests).toEqual([0, 1, 2, 2, 3]);
    expect(events.filter((e) => e.type === 'chunk-rejected')).toEqual([expect.objectContaining({ index: 2, attempt: 1 })]);
    expect(hex(h.disk)).toBe(entry.sha256);
  });

  it('rejects a tampered pack that never matches', async () => {
    const h = host({ corruptAlways: 1 });
    await expect(receiveChunks(entry, h.fetch, { startChunk: 0 })).rejects.toMatchObject({ code: 'tampered' });
    expect(h.requests).toEqual([0, 1, 1, 1]);
  });

  it('stops on an interruption and resumes from the verified prefix', async () => {
    const h = host({ dropAt: 2 });
    await expect(receiveChunks(entry, h.fetch, { startChunk: 0 })).rejects.toMatchObject({ code: 'interrupted' });
    // The partial file on disk now holds chunks 0 and 1; the resume point comes from hashing it.
    const written = 2 * CHUNK;
    const start = verifiedPrefix(entry, chunks(h.disk.subarray(0, written)), written);
    expect(start).toBe(2);
    const events: ReceiveEvent[] = [];
    const r = await receiveChunks(entry, h.fetch, { startChunk: start, onEvent: (e) => events.push(e) });
    expect(r.resumedFrom).toBe(2);
    expect(events[0]).toEqual({ type: 'resumed', fromChunk: 2, total });
    expect(h.requests).toEqual([0, 1, 2, 2, 3]);
    expect(hex(h.disk)).toBe(entry.sha256);
  });

  it('never resumes from bytes that do not match the catalog', () => {
    const disk = PACK_BYTES.slice();
    disk[CHUNK + 5] = (disk[CHUNK + 5] ?? 0) ^ 1;
    expect(verifiedPrefix(entry, chunks(disk), disk.length)).toBe(1);
    // A short last chunk on disk is not complete yet.
    expect(verifiedPrefix(entry, chunks(PACK_BYTES.subarray(0, CHUNK * 3 + 10)), CHUNK * 3 + 10)).toBe(3);
    expect(verifiedPrefix(entry, chunks(PACK_BYTES), PACK_BYTES.length)).toBe(total);
  });

  it('can be cancelled', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(receiveChunks(entry, host().fetch, { startChunk: 0, signal: ac.signal })).rejects.toMatchObject({ code: 'cancelled' });
  });
});
