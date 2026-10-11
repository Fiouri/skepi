import { describe, expect, it, vi } from 'vitest';
import { DATABASE_KEY_NAME, describeNativeFailure, loadOrCreateDatabaseKey, SecureStorageError, type SecureKeyStore } from '../src';

/** In-memory secure store with optional failures, the shape of expo-secure-store as apps/mobile/src/lib/db.ts uses it. */
function store(opts: { initial?: string | null; getError?: Error; setError?: Error; dropWrites?: boolean } = {}) {
  const items = new Map<string, string>();
  if (opts.initial != null) items.set(DATABASE_KEY_NAME, opts.initial);
  const s = {
    get: vi.fn((name: string): Promise<string | null> =>
      opts.getError !== undefined ? Promise.reject(opts.getError) : Promise.resolve(items.get(name) ?? null),
    ),
    set: vi.fn((name: string, value: string): Promise<void> => {
      if (opts.setError !== undefined) return Promise.reject(opts.setError);
      if (!opts.dropWrites) items.set(name, value);
      return Promise.resolve();
    }),
  } satisfies SecureKeyStore;
  return s;
}

const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 0xff);
const EXPECTED = Array.from(bytes(32), (b) => b.toString(16).padStart(2, '0')).join('');

/** Errors as expo-secure-store raises them (modules' CodedException: code + message). */
function coded(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

// expo-secure-store 57 on iOS: KeyChainException(OSStatus) -> ERR_KEY_CHAIN with SecCopyErrorMessageString;
// on Android: KeyStoreException / DecryptException / EncryptException (Android Keystore).
const PLATFORMS = {
  ios: {
    read: coded('ERR_KEY_CHAIN', "Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: A required entitlement isn't present."),
    write: coded('ERR_KEY_CHAIN', "Calling the 'setValueWithKeyAsync' function has failed\n→ Caused by: User interaction is not allowed. (-25308)"),
  },
  android: {
    read: coded('ERR_KEY_STORE', 'An error occurred when accessing the keystore: android.security.keystore.KeyPermanentlyInvalidatedException'),
    write: coded('ERR_ENCRYPT', "Could not encrypt the value for key 'skepi.appdb.key.v1' under keychain 'key_v1'. Caused by: Keystore operation failed"),
  },
} as const;

describe('loadOrCreateDatabaseKey', () => {
  it('creates a 256-bit key, stores it and reads it back on first start', async () => {
    const s = store();
    await expect(loadOrCreateDatabaseKey(s, bytes)).resolves.toBe(EXPECTED);
    expect(s.set).toHaveBeenCalledWith(DATABASE_KEY_NAME, EXPECTED);
    expect(s.get).toHaveBeenCalledTimes(2);
  });

  it('reuses the stored key', async () => {
    const s = store({ initial: 'ab'.repeat(32) });
    await expect(loadOrCreateDatabaseKey(s, bytes)).resolves.toBe('ab'.repeat(32));
    expect(s.set).not.toHaveBeenCalled();
  });

  it('refuses a key that the store did not keep', async () => {
    const s = store({ dropWrites: true });
    const e = await loadOrCreateDatabaseKey(s, bytes).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(SecureStorageError);
    expect((e as SecureStorageError).code).toBe('ERR_SECURE_STORAGE_WRITE');
  });

  for (const [platform, errors] of Object.entries(PLATFORMS)) {
    describe(`secure storage failures (${platform})`, () => {
      it('a failed read throws, creates no new key and returns nothing', async () => {
        const s = store({ initial: 'cd'.repeat(32), getError: errors.read });
        const e = await loadOrCreateDatabaseKey(s, bytes).catch((err: unknown) => err);
        expect(e).toBeInstanceOf(SecureStorageError);
        const err = e as SecureStorageError;
        expect(err.code).toBe('ERR_SECURE_STORAGE_READ');
        expect(err.native.code).toBe(errors.read.code);
        expect(err.displayCode.startsWith('ERR_SECURE_STORAGE_READ (')).toBe(true);
        expect(err.cause).toBe(errors.read);
        // Never a replacement key: that would orphan (or silently reset) the encrypted database.
        expect(s.set).not.toHaveBeenCalled();
      });

      it('a failed write throws and the new key is never used', async () => {
        const s = store({ setError: errors.write });
        const e = await loadOrCreateDatabaseKey(s, bytes).catch((err: unknown) => err);
        expect(e).toBeInstanceOf(SecureStorageError);
        expect((e as SecureStorageError).code).toBe('ERR_SECURE_STORAGE_WRITE');
        expect((e as SecureStorageError).message).not.toContain(EXPECTED);
      });
    });
  }

  it('reports the Keychain OSStatus when the message carries one', () => {
    expect(describeNativeFailure(PLATFORMS.ios.write)).toMatchObject({ code: 'ERR_KEY_CHAIN', osStatus: -25308 });
    expect(describeNativeFailure(PLATFORMS.android.read)).toMatchObject({ code: 'ERR_KEY_STORE', osStatus: null });
    expect(describeNativeFailure('plain text')).toMatchObject({ code: null, osStatus: null, message: 'plain text' });
    expect(new SecureStorageError('write', PLATFORMS.ios.write).displayCode).toBe('ERR_SECURE_STORAGE_WRITE (ERR_KEY_CHAIN, OSStatus -25308)');
    expect(new SecureStorageError('read', new Error('x')).displayCode).toBe('ERR_SECURE_STORAGE_READ');
  });
});
