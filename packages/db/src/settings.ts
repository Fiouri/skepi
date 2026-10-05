import type { SqlExecutor } from './db';

export interface SequenceSetting {
  sequence: number;
  sha256: string;
}

export interface TrustedKeySetting {
  keyId: string;
  publicKey: string;
}

/** Typed settings: every key has one value type, stored as JSON and validated on read. */
export interface Settings {
  /** Developer setting: force the T1 profile (Bench tab). */
  'dev.simulateT1': boolean;
  /** Highest catalog accepted on this device (anti-rollback). */
  'catalog.accepted': SequenceSetting;
  /** Highest key list accepted (rotation); its keys replace the pinned ones. */
  'catalog.keyList': SequenceSetting & { keys: TrustedKeySetting[] };
  /** The user allowed downloads on metered networks (default: Wi-Fi only). */
  'downloads.allowMetered': boolean;
  /** System downloads in flight, so a restarted app resumes verifying and installing them. */
  'downloads.active': ActiveDownload[];
}

export interface ActiveDownload {
  packId: string;
  downloadId: number;
  /** Index of the catalog mirror being downloaded. */
  mirror: number;
  rejectedMirrors: number;
  allowMetered: boolean;
}

export type SettingKey = keyof Settings;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSequence = (v: unknown): v is SequenceSetting =>
  isObject(v) && typeof v.sequence === 'number' && Number.isSafeInteger(v.sequence) && typeof v.sha256 === 'string';

const VALIDATORS: { [K in SettingKey]: (v: unknown) => v is Settings[K] } = {
  'dev.simulateT1': (v): v is boolean => typeof v === 'boolean',
  'catalog.accepted': isSequence,
  'catalog.keyList': (v): v is Settings['catalog.keyList'] => {
    if (!isSequence(v) || !isObject(v)) return false;
    const keys: unknown = v.keys;
    return Array.isArray(keys) && keys.every((k) => isObject(k) && typeof k.keyId === 'string' && typeof k.publicKey === 'string');
  },
  'downloads.allowMetered': (v): v is boolean => typeof v === 'boolean',
  'downloads.active': (v): v is ActiveDownload[] =>
    Array.isArray(v) &&
    v.every(
      (d) =>
        isObject(d) &&
        typeof d.packId === 'string' &&
        typeof d.downloadId === 'number' &&
        typeof d.mirror === 'number' &&
        typeof d.rejectedMirrors === 'number' &&
        typeof d.allowMetered === 'boolean',
    ),
};

/** The stored value, or null when unset or unreadable (a corrupt value never crashes startup). */
export async function getSetting<K extends SettingKey>(db: SqlExecutor, key: K): Promise<Settings[K] | null> {
  const { rows } = await db.execute('SELECT value FROM settings WHERE key = ?', [key]);
  const raw = rows[0]?.value;
  if (typeof raw !== 'string') return null;
  try {
    const value: unknown = JSON.parse(raw);
    return VALIDATORS[key](value) ? value : null;
  } catch {
    return null;
  }
}

export async function setSetting<K extends SettingKey>(db: SqlExecutor, key: K, value: Settings[K]): Promise<void> {
  if (!VALIDATORS[key](value)) throw new Error(`invalid value for setting ${key}`);
  await db.execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    JSON.stringify(value),
  ]);
}

export async function deleteSetting(db: SqlExecutor, key: SettingKey): Promise<void> {
  await db.execute('DELETE FROM settings WHERE key = ?', [key]);
}
