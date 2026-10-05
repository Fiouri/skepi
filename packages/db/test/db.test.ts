import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  batteryDeltaPct,
  ENERGY_SAMPLES_KEPT,
  estimateEnergy,
  formatEnergy,
  getPack,
  listEnergySamples,
  recordEnergySample,
  type EnergySample,
  getSetting,
  listPacks,
  migrate,
  MigrationError,
  MIGRATIONS,
  removePack,
  schemaVersion,
  setConsent,
  setSetting,
  upsertPack,
  type Migration,
  type PackRow,
  type Row,
  type SqlDatabase,
  type SqlValue,
} from '../src';

/** node:sqlite adapter with the op-sqlite surface the app uses. */
function memoryDb(): SqlDatabase & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const run = (sql: string): void => {
    raw.prepare(sql).run();
  };
  const execute = (sql: string, params: readonly SqlValue[] = []): Promise<{ rows: Row[] }> => {
    const stmt = raw.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH)/i.test(sql)) return Promise.resolve({ rows: stmt.all(...(params as SQLInputValue[])) });
    stmt.run(...(params as SQLInputValue[]));
    return Promise.resolve({ rows: [] });
  };
  return {
    raw,
    execute,
    transaction: async (fn) => {
      run('BEGIN');
      try {
        await fn({ execute });
        run('COMMIT');
      } catch (e) {
        run('ROLLBACK');
        throw e;
      }
    },
  };
}

const PACK: PackRow = {
  id: 'wikipedia_en_top_mini',
  kind: 'zim',
  version: '2026-09',
  title: 'Wikipedia top',
  path: '/data/zim/wikipedia_en_top_mini_2026-09.zim',
  sizeBytes: 296858160,
  sha256: '9e75b5f03b4ff61864772d811bd9715c9cdc27a429229abb779aaa3cc3aa8e05',
  verified: true,
  catalogSeq: 3,
  license: 'CC-BY-SA-4.0',
  source: 'download',
  consentAt: null,
  installedAt: 1000,
  lastOpenedAt: null,
};

describe('migrate', () => {
  it('applies every migration once, in order, and is idempotent', async () => {
    const db = memoryDb();
    expect(await migrate(db, MIGRATIONS, () => 42)).toEqual([1, 2]);
    expect(await migrate(db)).toEqual([]);
    expect(await schemaVersion(db)).toBe(MIGRATIONS.length);
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map((r) => r.name);
    expect(tables).toEqual(['energy_samples', 'packs', 'schema_migrations', 'settings']);
  });

  it('applies later migrations forward only, keeping data', async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertPack(db, PACK);
    const next: Migration[] = [...MIGRATIONS, { version: 3, name: 'test_add', statements: ['CREATE TABLE extra (x INTEGER)'] }];
    expect(await migrate(db, next)).toEqual([3]);
    expect(await getPack(db, PACK.id)).toEqual(PACK);
  });

  it('rolls back a failing migration completely', async () => {
    const db = memoryDb();
    const broken: Migration[] = [{ version: 1, name: 'broken', statements: ['CREATE TABLE a (x INTEGER)', 'NOT SQL'] }];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await schemaVersion(db)).toBe(0);
    expect((await db.execute("SELECT name FROM sqlite_master WHERE name = 'a'")).rows).toEqual([]);
  });

  it('refuses downgrades, edited migrations and gaps', async () => {
    const db = memoryDb();
    await migrate(db, [...MIGRATIONS, { version: MIGRATIONS.length + 1, name: 'future', statements: ['SELECT 1'] }]);
    await expect(migrate(db, MIGRATIONS)).rejects.toThrow(MigrationError);
    const edited = memoryDb();
    await migrate(edited);
    await expect(migrate(edited, [{ ...MIGRATIONS[0], name: 'renamed' } as Migration])).rejects.toThrow(/in the code/);
    await expect(migrate(memoryDb(), [{ version: 2, name: 'gap', statements: [] }])).rejects.toThrow(/without gaps/);
  });
});

describe('packs', () => {
  it('registers, lists, updates and removes packs', async () => {
    const db = memoryDb();
    await migrate(db);
    await upsertPack(db, PACK);
    await upsertPack(db, { ...PACK, version: '2026-10', installedAt: 2000 });
    expect(await listPacks(db)).toEqual([{ ...PACK, version: '2026-10', installedAt: 2000 }]);
    await removePack(db, PACK.id);
    expect(await listPacks(db)).toEqual([]);
  });

  it('allows unverified packs only for ZIM, and consent only on unverified packs', async () => {
    const db = memoryDb();
    await migrate(db);
    const imported: PackRow = { ...PACK, id: 'import-1', path: '/data/zim/x.zim', verified: false, catalogSeq: null, source: 'import' };
    await upsertPack(db, imported);
    await setConsent(db, 'import-1', 5000);
    expect((await getPack(db, 'import-1'))?.consentAt).toBe(5000);
    await upsertPack(db, PACK);
    await setConsent(db, PACK.id, 5000);
    expect((await getPack(db, PACK.id))?.consentAt).toBeNull();
    await expect(upsertPack(db, { ...imported, id: 'model', kind: 'gguf', path: '/data/models/m.gguf' })).rejects.toThrow();
    await expect(upsertPack(db, { ...imported, id: 'bad', path: '/x.zim', catalogSeq: 3 })).rejects.toThrow();
    await expect(upsertPack(db, { ...PACK, id: 'dup-path' })).rejects.toThrow();
  });
});

describe('settings', () => {
  it('persists typed values (the T1-simulation setting) and validates on read and write', async () => {
    const db = memoryDb();
    await migrate(db);
    expect(await getSetting(db, 'dev.simulateT1')).toBeNull();
    await setSetting(db, 'dev.simulateT1', true);
    expect(await getSetting(db, 'dev.simulateT1')).toBe(true);
    await setSetting(db, 'dev.simulateT1', false);
    expect(await getSetting(db, 'dev.simulateT1')).toBe(false);
    await setSetting(db, 'catalog.accepted', { sequence: 7, sha256: 'ab' });
    expect(await getSetting(db, 'catalog.accepted')).toEqual({ sequence: 7, sha256: 'ab' });
    await expect(setSetting(db, 'catalog.accepted', { sequence: 1.5, sha256: 'x' })).rejects.toThrow();
    await db.execute("UPDATE settings SET value = '{broken' WHERE key = 'catalog.accepted'");
    expect(await getSetting(db, 'catalog.accepted')).toBeNull();
  });
});

describe('energy samples', () => {
  const sample = (pct: number, at: number): EnergySample => ({ action: 'ai-summary', tier: 'T2', batteryDeltaPct: pct, durationMs: 9000, createdAt: at });

  it('records samples per action and tier and keeps only the newest ones', async () => {
    const db = memoryDb();
    await migrate(db);
    for (let i = 0; i < ENERGY_SAMPLES_KEPT + 5; i += 1) await recordEnergySample(db, sample(0.1 * i, 1000 + i));
    await recordEnergySample(db, { ...sample(2, 5000), tier: 'T1' });
    const t2 = await listEnergySamples(db, 'ai-summary', 'T2');
    expect(t2).toHaveLength(ENERGY_SAMPLES_KEPT);
    expect(t2[0]?.createdAt).toBe(1000 + ENERGY_SAMPLES_KEPT + 4);
    expect(await listEnergySamples(db, 'ai-summary', 'T1')).toHaveLength(1);
  });

  it('rejects impossible values', async () => {
    const db = memoryDb();
    await migrate(db);
    await expect(recordEnergySample(db, sample(-1, 1))).rejects.toThrow();
    await expect(recordEnergySample(db, sample(101, 1))).rejects.toThrow();
    await expect(recordEnergySample(db, { ...sample(1, 1), durationMs: 1.5 })).rejects.toThrow();
  });

  it('estimates the median once enough samples exist, and formats it', () => {
    expect(estimateEnergy([sample(1, 1), sample(2, 2)])).toBeNull();
    expect(estimateEnergy([sample(0.2, 1), sample(5, 2), sample(0.4, 3)])).toEqual({ pct: 0.4, samples: 3 });
    expect(estimateEnergy([sample(1, 1), sample(2, 2), sample(3, 3), sample(4, 4)])?.pct).toBe(2.5);
    expect(formatEnergy({ pct: 0.05, samples: 3 })).toBe('< 0.1%');
    expect(formatEnergy({ pct: 0.42, samples: 3 })).toBe('≈ 0.4%');
    expect(formatEnergy({ pct: 1.6, samples: 3 })).toBe('≈ 2%');
  });

  it('validates the onboarding and blackout settings', async () => {
    const db = memoryDb();
    await migrate(db);
    await setSetting(db, 'region.country', 'GR');
    await setSetting(db, 'ui.locale', 'el');
    await setSetting(db, 'blackout.enabled', true);
    expect(await getSetting(db, 'region.country')).toBe('GR');
    expect(await getSetting(db, 'ui.locale')).toBe('el');
    expect(await getSetting(db, 'blackout.enabled')).toBe(true);
    await expect(setSetting(db, 'region.country', 'greece')).rejects.toThrow();
    await expect(setSetting(db, 'storage.budgetGb', -2)).rejects.toThrow();
  });
});

describe('batteryDeltaPct', () => {
  const r = (levelPct: number | null, chargeCounterUah: number | null, charging = false) => ({ levelPct, chargeCounterUah, charging });

  it('uses the charge counter when both readings have it', () => {
    // 4,000,000 µAh at 80% → full 5,000,000 µAh; 50,000 µAh used = 1%.
    expect(batteryDeltaPct(r(80, 4_000_000), r(80, 3_950_000))).toBeCloseTo(1, 6);
  });

  it('falls back to the level steps, and never goes negative', () => {
    expect(batteryDeltaPct(r(55, null), r(54, null))).toBe(1);
    expect(batteryDeltaPct(r(55, 100), r(56, 200))).toBe(0);
  });

  it('measures nothing while charging or without readings', () => {
    expect(batteryDeltaPct(r(50, 1000, true), r(49, 900))).toBeNull();
    expect(batteryDeltaPct(r(null, null), r(40, null))).toBeNull();
  });
});
