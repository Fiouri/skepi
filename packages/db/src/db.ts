import { MIGRATIONS, type Migration } from './migrations';

export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;

/** The minimal SQL surface the app needs; adapters: op-sqlite (mobile), node:sqlite (tests). */
export interface SqlExecutor {
  execute(sql: string, params?: readonly SqlValue[]): Promise<{ rows: Row[] }>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Runs `fn` in one transaction: committed when it resolves, rolled back when it throws. */
  transaction(fn: (tx: SqlExecutor) => Promise<void>): Promise<void>;
}

export class MigrationError extends Error {}

const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)`;

/**
 * Applies the pending migrations in order, each in its own transaction. Refuses a database written
 * by a newer app (a version it does not know) and a ledger whose names differ from the code (an
 * edited migration): both mean the schema is not what this code expects.
 */
export async function migrate(db: SqlDatabase, migrations: readonly Migration[] = MIGRATIONS, now: () => number = Date.now): Promise<number[]> {
  for (let i = 0; i < migrations.length; i += 1) {
    if (migrations[i]?.version !== i + 1) throw new MigrationError(`migrations must be numbered 1..n without gaps (at index ${String(i)})`);
  }
  await db.execute(LEDGER);
  const { rows } = await db.execute('SELECT version, name FROM schema_migrations ORDER BY version');
  const applied = rows.map((r) => ({ version: Number(r.version), name: String(r.name) }));
  const known = new Map(migrations.map((m) => [m.version, m]));
  for (const a of applied) {
    const m = known.get(a.version);
    if (!m) throw new MigrationError(`database has migration ${String(a.version)} (${a.name}), newer than this app; downgrades are not supported`);
    if (m.name !== a.name) throw new MigrationError(`migration ${String(a.version)} is "${a.name}" in the database but "${m.name}" in the code`);
  }
  const done = new Set(applied.map((a) => a.version));
  const ran: number[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.execute(sql);
      await tx.execute('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, now()]);
    });
    ran.push(m.version);
  }
  return ran;
}

export async function schemaVersion(db: SqlExecutor): Promise<number> {
  const { rows } = await db.execute('SELECT MAX(version) AS v FROM schema_migrations');
  const v = rows[0]?.v;
  return typeof v === 'number' ? v : 0;
}
