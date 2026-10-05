import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NO_SEQUENCE, pinnedKeys, trustedFromPinned, verifyCatalog, verifyKeyList } from '@skepi/core';
import { describe, expect, it } from 'vitest';
import { buildCatalog, nextSequence, sequenceOf, signKeyList, verifyCatalogDir, writeSigned } from '../src/build';
import { digestFile } from '../src/hash';
import { assertOutsideRepo, keygen, readSecretKey, REPO_ROOT } from '../src/keys';
import { parseManifest, type Manifest } from '../src/manifest';

const dir = mkdtempSync(join(tmpdir(), 'skepi-catalog-'));

function key(id: string): { keyId: string; secretKey: Uint8Array; publicKey: string } {
  const path = join(dir, `${id}.key.json`);
  keygen(id, path);
  return readSecretKey(path);
}

const active = key('cat-unit-a');
const backup = key('cat-unit-b');
const trusted = trustedFromPinned(
  pinnedKeys({ active: { keyId: active.keyId, publicKey: active.publicKey }, backup: { keyId: backup.keyId, publicKey: backup.publicKey } }),
);

const packFile = join(dir, 'tiny.zim');
writeFileSync(packFile, Buffer.alloc(300_000, 7));

const manifest: Manifest = parseManifest(
  JSON.stringify({
    schema: 1,
    packs: [
      {
        id: 'tiny-test',
        kind: 'zim',
        version: '1',
        file: 'tiny.zim',
        title: { en: 'Tiny test pack' },
        lang: ['en'],
        urls: ['https://127.0.0.1:8443/packs/tiny.zim'],
        license: 'CC0-1.0',
        attribution: 'SKEPI tests',
        minTier: 'T0',
        tags: ['test'],
        source: { kind: 'local', path: packFile },
      },
    ],
  }),
);

describe('keys', () => {
  it('refuses secret keys inside the repository', () => {
    expect(() => {
      assertOutsideRepo(join(REPO_ROOT, 'catalog', 'secret.json'));
    }).toThrow(/outside the repository/);
    expect(() => keygen('cat-x', join(REPO_ROOT, 'x.key.json'))).toThrow(/outside the repository/);
    expect(() => {
      assertOutsideRepo(join(dir, 'ok.json'));
    }).not.toThrow();
  });

  it('never overwrites an existing key file and checks the key pair on read', () => {
    expect(() => keygen('cat-unit-a', join(dir, 'cat-unit-a.key.json'))).toThrow();
    const path = join(dir, 'broken.key.json');
    writeFileSync(path, JSON.stringify({ schema: 1, keyId: 'x', secretKey: active.publicKey, publicKey: backup.publicKey }));
    expect(() => readSecretKey(path)).toThrow(/does not match/);
  });
});

describe('digestFile', () => {
  it('hashes the file and every chunk in one pass', async () => {
    const d = await digestFile(packFile, 128 * 1024);
    const bytes = readFileSync(packFile);
    expect(d.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(d.chunkSha256).toHaveLength(3);
    expect(d.chunkSha256[2]).toBe(createHash('sha256').update(bytes.subarray(256 * 1024)).digest('hex'));
  });
});

describe('buildCatalog', () => {
  it('measures packs, signs the exact bytes and verifies with the app code', async () => {
    const built = await buildCatalog({ manifest, cacheDir: dir, key: active, previousSequence: null, issuedAt: '2026-10-05T00:00:00Z' });
    expect(built.catalog.sequence).toBe(1);
    expect(built.catalog.packs[0]).toMatchObject({ id: 'tiny-test', sizeBytes: 300_000, chunkSha256: [expect.any(String)] });
    const out = join(dir, 'out');
    await writeSigned(out, 'catalog.json', built);
    expect(verifyCatalogDir(out, trusted)).toMatchObject({ ok: true, sequence: 1 });
    expect(sequenceOf(join(out, 'catalog.json'))).toBe(1);
    const next = await buildCatalog({ manifest, cacheDir: dir, key: backup, previousSequence: 1 });
    expect(verifyCatalog(next.bytes, next.signature, trusted, { sequence: 1, sha256: null })).toMatchObject({ ok: true, sequence: 2 });
  });

  it('sequence must always increase', () => {
    expect(nextSequence(null, undefined)).toBe(1);
    expect(nextSequence(41, undefined)).toBe(42);
    expect(nextSequence(41, 50)).toBe(50);
    expect(() => nextSequence(41, 41)).toThrow(/always increase/);
    expect(() => nextSequence(41, 7)).toThrow(/always increase/);
  });

  it('rejects a pack whose bytes do not match the pinned upstream checksum', async () => {
    const pinned: Manifest = {
      ...manifest,
      packs: manifest.packs.map((p) => ({
        ...p,
        source: { kind: 'download', url: 'https://127.0.0.1:1/unused.zim', upstreamSha256: '0'.repeat(64), upstreamSha256From: 'test' },
      })),
    };
    // The file is already in the cache, so nothing is downloaded; the checksum check still runs.
    writeFileSync(join(dir, 'tiny.zim'), Buffer.alloc(300_000, 7));
    await expect(buildCatalog({ manifest: pinned, cacheDir: dir, key: active, previousSequence: null })).rejects.toThrow(/does not match the publisher/);
  });
});

describe('signKeyList (rotation)', () => {
  it('produces a key list the app accepts when signed by the replaced key', () => {
    const next = key('cat-unit-c');
    const signed = signKeyList(
      {
        sequence: 2,
        issuedAt: '2027-01-01T00:00:00Z',
        keys: [
          { keyId: next.keyId, publicKey: next.publicKey, role: 'active' },
          { keyId: backup.keyId, publicKey: backup.publicKey, role: 'backup' },
        ],
      },
      active,
    );
    const r = verifyKeyList(signed.bytes, signed.signature, trusted, NO_SEQUENCE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.keys.map((k) => k.keyId)).toEqual(['cat-unit-c', 'cat-unit-b']);
  });
});

describe('parseManifest', () => {
  it('requires an upstream checksum for downloads and HTTPS mirrors', () => {
    const base = JSON.parse(JSON.stringify(manifest)) as { schema: 1; packs: Record<string, unknown>[] };
    const withSource = (source: unknown, urls?: string[]): string =>
      JSON.stringify({ ...base, packs: [{ ...base.packs[0], source, ...(urls ? { urls } : {}) }] });
    expect(() => parseManifest(withSource({ kind: 'download', url: 'https://x/a.zim' }))).toThrow(/upstream checksum/);
    expect(() => parseManifest(withSource({ kind: 'download', url: 'http://x/a.zim', upstreamSha256Url: 'https://x/a.sha256' }))).toThrow(/HTTPS/);
    expect(() => parseManifest(withSource({ kind: 'local', path: 'a.zim' }, ['https://x/a.zim?k=1']))).toThrow(/query/);
  });
});
