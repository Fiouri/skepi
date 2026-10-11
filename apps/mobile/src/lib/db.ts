import { open, type DB } from '@op-engineering/op-sqlite';
import { loadOrCreateDatabaseKey, migrate, SecureStorageError, type Row, type SqlDatabase, type SqlExecutor, type SqlValue } from '@skepi/db';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * app.db: SQLite encrypted with SQLCipher (op-sqlite, `"op-sqlite": { "sqlcipher": true }` in
 * package.json). The 256-bit key is random per install and kept by expo-secure-store, which encrypts
 * it with an AES key held in the Android Keystore; the key never leaves the device and is excluded
 * from backups (allowBackup=false). On iOS it is a Keychain item (this device only, when unlocked).
 * If the secure storage fails, app.db stays closed and the app shows "Secure storage unavailable" with
 * Retry (app/_layout.tsx): there is never a fallback key or an unencrypted database.
 */
const DB_NAME = 'app.db';
const secureStore = {
  get: (name: string) => SecureStore.getItemAsync(name),
  set: (name: string, value: string) => SecureStore.setItemAsync(name, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
};

async function databaseKey(): Promise<string> {
  try {
    return await loadOrCreateDatabaseKey(secureStore, getRandomBytes);
  } catch (e) {
    // Logged with the native code (never the key); the startup screen shows the same code.
    if (e instanceof SecureStorageError) console.error(`[skepi] ${e.displayCode}: ${e.native.message}`);
    throw e;
  }
}

function adapt(db: Pick<DB, 'execute'>): SqlExecutor {
  return {
    execute: async (sql: string, params: readonly SqlValue[] = []): Promise<{ rows: Row[] }> => {
      const res = await db.execute(sql, [...params]);
      return { rows: res.rows };
    },
  };
}

let opened: Promise<SqlDatabase> | null = null;

/** Opens (once) and migrates the encrypted app database. A failed open is not cached, so Retry works. */
export function appDb(): Promise<SqlDatabase> {
  opened ??= (async () => {
    const key = await databaseKey();
    let raw = open({ name: DB_NAME, encryptionKey: key });
    try {
      // SQLCipher check: a wrong key or a plain-text file fails here, not on the first real query.
      await raw.execute('SELECT count(*) AS n FROM sqlite_master');
    } catch {
      // The key no longer matches the file (e.g. the Keystore entry was reset). The database holds
      // only metadata that startup rebuilds from the files on disk, so start a new one.
      raw.delete();
      raw = open({ name: DB_NAME, encryptionKey: key });
    }
    const conn = raw;
    const db: SqlDatabase = {
      ...adapt(conn),
      transaction: (fn) => conn.transaction((tx) => fn(adapt(tx))),
    };
    await migrate(db);
    return db;
  })();
  const attempt = opened;
  attempt.catch(() => {
    if (opened === attempt) opened = null;
  });
  return attempt;
}
