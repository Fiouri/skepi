import { fromBase64, generateKeyPair, publicKeyOf, toBase64, type PinnedKeyInput } from '@skepi/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root: secret keys must never be written or read inside it. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface SecretKeyFile {
  schema: 1;
  keyId: string;
  /** 32-byte Ed25519 seed, base64. */
  secretKey: string;
  publicKey: string;
}

const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Refuses a secret-key path inside the repository (or any root in `forbidden`): the catalog key lives
 * outside the repo, offline, and never in CI.
 */
export function assertOutsideRepo(path: string, forbidden: readonly string[] = [REPO_ROOT]): void {
  for (const root of forbidden) {
    if (isInside(root, path)) throw new Error(`refusing to use a secret key inside ${root}: ${path}. Keep catalog keys outside the repository.`);
  }
}

/** Creates a new keypair file (never overwrites) and returns the public part for pinning. */
export function keygen(keyId: string, out: string, forbidden?: readonly string[]): PinnedKeyInput {
  if (!KEY_ID.test(keyId)) throw new Error(`invalid key id "${keyId}" (lowercase letters, digits, . _ -)`);
  assertOutsideRepo(out, forbidden);
  const { secretKey, publicKey } = generateKeyPair();
  const file: SecretKeyFile = { schema: 1, keyId, secretKey: toBase64(secretKey), publicKey: toBase64(publicKey) };
  // 'wx': fail if the file exists, so a key is never replaced by accident.
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { keyId, publicKey: file.publicKey };
}

/** Reads a secret key file (outside the repo) and checks that its public key matches the seed. */
export function readSecretKey(path: string, forbidden?: readonly string[]): { keyId: string; secretKey: Uint8Array; publicKey: string } {
  assertOutsideRepo(path, forbidden);
  const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<SecretKeyFile>;
  if (data.schema !== 1 || typeof data.keyId !== 'string' || typeof data.secretKey !== 'string' || typeof data.publicKey !== 'string') {
    throw new Error(`${path}: not a SKEPI catalog key file`);
  }
  const secretKey = fromBase64(data.secretKey);
  if (secretKey.length !== 32) throw new Error(`${path}: secret key must be 32 bytes`);
  if (toBase64(publicKeyOf(secretKey)) !== data.publicKey) throw new Error(`${path}: public key does not match the secret key`);
  return { keyId: data.keyId, secretKey, publicKey: data.publicKey };
}

/** Pinned public keys as embedded in the app (catalog/keys/<build>.json). */
export interface PinnedKeysFile {
  schema: 1;
  /** `release` keys sign the catalog shipped in release builds; `test` keys never ship in release. */
  purpose: 'release' | 'test';
  active: PinnedKeyInput;
  backup: PinnedKeyInput;
}

export function readPinnedKeys(path: string): PinnedKeysFile {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<PinnedKeysFile>;
  if (data.schema !== 1 || (data.purpose !== 'release' && data.purpose !== 'test') || !data.active || !data.backup) {
    throw new Error(`${path}: not a pinned keys file`);
  }
  return data as PinnedKeysFile;
}
