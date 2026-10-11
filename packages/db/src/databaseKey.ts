/**
 * The app.db key on the phones: 256 bits, random per install, kept only in the platform's secure storage
 * (expo-secure-store: iOS Keychain, Android Keystore). Pure logic over an injected store, so the failure
 * paths are unit-tested in Node with the error shapes of both platforms.
 *
 * Rules: a key is returned only when the secure storage holds it (written and read back); any storage
 * failure throws SecureStorageError, and the app stops on an error screen with Retry. There is no
 * fallback: never a key in a file, in app.db or in memory only, never an unencrypted database.
 */

export const DATABASE_KEY_NAME = 'skepi.appdb.key.v1';

const KEY_HEX = /^[0-9a-f]{64}$/;
// Keychain errors are negative OSStatus values (errSecMissingEntitlement -34018, errSecInteractionNotAllowed -25308, ...).
const OS_STATUS = /(?:^|[^\d])(-\d{4,5})(?!\d)/;

/** expo-secure-store as the app uses it (getItemAsync / setItemAsync). */
export interface SecureKeyStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
}

export type SecureStorageStep = 'read' | 'write';

/** What the platform reported: the module's error code and, on iOS, the Keychain OSStatus. */
export interface NativeStorageFailure {
  code: string | null;
  osStatus: number | null;
  message: string;
}

export function describeNativeFailure(error: unknown): NativeStorageFailure {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const raw = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  const code = typeof raw === 'string' && raw.length > 0 ? raw : null;
  const status = message.match(OS_STATUS);
  return { code, osStatus: status?.[1] !== undefined ? Number(status[1]) : null, message };
}

/** The secure storage refused to read or write the key: app.db stays closed. */
export class SecureStorageError extends Error {
  readonly code: 'ERR_SECURE_STORAGE_READ' | 'ERR_SECURE_STORAGE_WRITE';
  readonly step: SecureStorageStep;
  readonly native: NativeStorageFailure;

  constructor(step: SecureStorageStep, cause: unknown) {
    const native = describeNativeFailure(cause);
    super(`secure storage ${step} failed: ${native.message}`, { cause });
    this.name = 'SecureStorageError';
    this.step = step;
    this.code = step === 'read' ? 'ERR_SECURE_STORAGE_READ' : 'ERR_SECURE_STORAGE_WRITE';
    this.native = native;
  }

  /** The code shown on the error screen, e.g. `ERR_SECURE_STORAGE_READ (ERR_KEY_CHAIN, OSStatus -34018)`. */
  get displayCode(): string {
    const parts = [this.native.code, this.native.osStatus !== null ? `OSStatus ${String(this.native.osStatus)}` : null].filter(
      (p): p is string => p !== null,
    );
    return parts.length > 0 ? `${this.code} (${parts.join(', ')})` : this.code;
  }
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * The existing key, or a new one stored and read back. A failed read never creates a new key (that
 * would orphan the existing database); a key that does not read back is never used.
 */
export async function loadOrCreateDatabaseKey(store: SecureKeyStore, randomBytes: (n: number) => Uint8Array): Promise<string> {
  let existing: string | null;
  try {
    existing = await store.get(DATABASE_KEY_NAME);
  } catch (e) {
    throw new SecureStorageError('read', e);
  }
  if (existing !== null && KEY_HEX.test(existing)) return existing;

  const key = toHex(randomBytes(32));
  if (!KEY_HEX.test(key)) throw new Error('random source returned the wrong number of bytes');
  try {
    await store.set(DATABASE_KEY_NAME, key);
  } catch (e) {
    throw new SecureStorageError('write', e);
  }
  let stored: string | null;
  try {
    stored = await store.get(DATABASE_KEY_NAME);
  } catch (e) {
    throw new SecureStorageError('read', e);
  }
  if (stored !== key) throw new SecureStorageError('write', new Error('the stored key does not read back'));
  return key;
}
