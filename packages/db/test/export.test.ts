import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src';
import { migrationsJson } from '../src/export';

describe('migrations.json (desktop copy)', () => {
  it('matches MIGRATIONS exactly (run: pnpm --filter @skepi/db export-migrations)', () => {
    const file = readFileSync(fileURLToPath(new URL('../migrations.json', import.meta.url)), 'utf8');
    expect(file.replace(/\r\n/g, '\n')).toBe(migrationsJson());
    const parsed = JSON.parse(file) as { migrations: { version: number; name: string; statements: string[] }[] };
    expect(parsed.migrations.map((m) => m.version)).toEqual(MIGRATIONS.map((m) => m.version));
  });
});
