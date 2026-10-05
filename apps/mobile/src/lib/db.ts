import { open, type DB } from '@op-engineering/op-sqlite';
import { migrate, type Row, type SqlDatabase, type SqlExecutor, type SqlValue } from '@skepi/db';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * app.db: SQLite encrypted with SQLCipher (op-sqlite, `"op-sqlite": { "sqlcipher": true }` in
 * package.json). The 256-bit key is random per install and kept by expo-secure-store, which encrypts
 * it with an AES key held in the Android Keystore; the key never leaves the device and is excluded
 * from backups (allowBackup=false).
 */
const DB_NAME = 'app.db';
const KEY_NAME = 'skepi.appdb.key.v1';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const key = toHex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return key;
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

/** Opens (once) and migrates the encrypted app database. */
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
  return opened;
}
