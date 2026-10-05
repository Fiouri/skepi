import { pinnedKeys, trustedFromPinned, type PinnedKeyInput } from '@skepi/core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildCatalog, sequenceOf, signKeyList, verifyCatalogDir, verifyKeyListDir, writeSigned } from './build';
import { keygen, readPinnedKeys, readSecretKey, REPO_ROOT, type PinnedKeysFile } from './keys';
import { mergeManifests, readManifest } from './manifest';

/**
 * SKEPI catalog-builder (dev machine only; the signing key never enters CI).
 *
 *   keygen  --key-id <id> --out <file outside the repo>
 *   pin     --active <id.pub.json> --backup <id.pub.json> --purpose release|test --out catalog/keys/<purpose>.json
 *   build   --manifest catalog/manifest.json [--manifest more.json] --key <secret file> --out <dir> [--cache <dir>] [--sequence N] [--previous <catalog.json>]
 *   keylist --pinned <new keys json> --key <secret of the replaced key> --sequence N --out <dir>
 *   verify  --dir <dir> --pinned catalog/keys/<purpose>.json [--release]
 */
const USAGE = 'usage: catalog <keygen|pin|build|keylist|verify> [options] (see src/cli.ts)';

const [command, ...rest] = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
const { values: args } = parseArgs({
  args: rest,
  options: {
    'key-id': { type: 'string' },
    out: { type: 'string' },
    active: { type: 'string' },
    backup: { type: 'string' },
    purpose: { type: 'string' },
    manifest: { type: 'string', multiple: true },
    key: { type: 'string' },
    cache: { type: 'string' },
    sequence: { type: 'string' },
    previous: { type: 'string' },
    'issued-at': { type: 'string' },
    pinned: { type: 'string' },
    dir: { type: 'string' },
    release: { type: 'boolean', default: false },
  },
});

function need(name: string, value: string | undefined): string {
  if (!value) throw new Error(`--${name} is required\n${USAGE}`);
  return value;
}

function cacheDir(): string {
  return args.cache ?? process.env.SKEPI_CACHE_DIR ?? join(process.env.TEMP ?? tmpdir(), 'skepi', 'cache');
}

function readPublic(path: string): PinnedKeyInput {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<PinnedKeyInput>;
  if (typeof data.keyId !== 'string' || typeof data.publicKey !== 'string') throw new Error(`${path}: expected { keyId, publicKey }`);
  return { keyId: data.keyId, publicKey: data.publicKey };
}

async function main(): Promise<number> {
  switch (command) {
    case 'keygen': {
      const out = resolve(need('out', args.out));
      const pub = keygen(need('key-id', args['key-id']), out);
      const pubPath = `${out}.pub.json`;
      writeFileSync(pubPath, `${JSON.stringify(pub, null, 2)}\n`, { flag: 'wx' });
      console.log(`secret key written to ${out} (keep it offline, never commit it, never put it in CI)`);
      console.log(`public key written to ${pubPath}:\n${JSON.stringify(pub, null, 2)}`);
      return 0;
    }
    case 'pin': {
      const purpose = need('purpose', args.purpose);
      if (purpose !== 'release' && purpose !== 'test') throw new Error('--purpose must be release or test');
      const file: PinnedKeysFile = { schema: 1, purpose, active: readPublic(need('active', args.active)), backup: readPublic(need('backup', args.backup)) };
      pinnedKeys(file);
      if (file.active.keyId === file.backup.keyId || file.active.publicKey === file.backup.publicKey) throw new Error('active and backup keys must differ');
      writeFileSync(need('out', args.out), `${JSON.stringify(file, null, 2)}\n`);
      console.log(`pinned ${purpose} keys: active ${file.active.keyId}, backup ${file.backup.keyId}`);
      return 0;
    }
    case 'build': {
      const out = resolve(need('out', args.out));
      const key = readSecretKey(need('key', args.key));
      const previousPath = args.previous ?? join(out, 'catalog.json');
      const built = await buildCatalog({
        manifest: mergeManifests((args.manifest ?? []).map(readManifest)),
        cacheDir: cacheDir(),
        key,
        previousSequence: sequenceOf(previousPath),
        ...(args.sequence ? { sequence: Number(args.sequence) } : {}),
        ...(args['issued-at'] ? { issuedAt: args['issued-at'] } : {}),
        log: (line) => {
          console.log(line);
        },
      });
      await writeSigned(out, 'catalog.json', built);
      console.log(`catalog sequence ${String(built.catalog.sequence)} with ${String(built.catalog.packs.length)} packs signed by ${key.keyId} -> ${out}`);
      return 0;
    }
    case 'keylist': {
      const signer = readSecretKey(need('key', args.key));
      const next = readPinnedKeys(need('pinned', args.pinned));
      const signed = signKeyList(
        {
          sequence: Number(need('sequence', args.sequence)),
          issuedAt: args['issued-at'] ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          keys: [
            { ...next.active, role: 'active' },
            { ...next.backup, role: 'backup' },
          ],
        },
        signer,
      );
      await writeSigned(resolve(need('out', args.out)), 'keys.json', signed);
      console.log(`key list signed by ${signer.keyId}: active ${next.active.keyId}, backup ${next.backup.keyId}`);
      return 0;
    }
    case 'verify': {
      const dir = resolve(need('dir', args.dir));
      const pinnedFile = readPinnedKeys(need('pinned', args.pinned));
      const trusted = trustedFromPinned(pinnedKeys(pinnedFile));
      if (args.release) {
        // A release build must embed a catalog signed with the real key: never the test key.
        if (pinnedFile.purpose !== 'release') throw new Error('release builds must pin purpose "release" keys');
        const testKeys = join(REPO_ROOT, 'catalog', 'keys', 'test.json');
        if (existsSync(testKeys)) {
          const test = readPinnedKeys(testKeys);
          const testPublic = new Set([test.active.publicKey, test.backup.publicKey]);
          if (testPublic.has(pinnedFile.active.publicKey) || testPublic.has(pinnedFile.backup.publicKey)) {
            throw new Error('release keys must not be the test keys');
          }
        }
      }
      const r = verifyCatalogDir(dir, trusted);
      if (!r.ok) {
        console.error(`CATALOG REJECTED (${r.reason}): ${r.detail}`);
        return 1;
      }
      if (existsSync(join(dir, 'keys.json'))) {
        const k = verifyKeyListDir(dir, trusted);
        if (!k.ok) {
          console.error(`KEY LIST REJECTED (${k.reason}): ${k.detail}`);
          return 1;
        }
      }
      console.log(`catalog OK: sequence ${String(r.sequence)}, ${String(r.value.packs.length)} packs, key ${r.value.keyId}, sha256 ${r.sha256}`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  },
);
