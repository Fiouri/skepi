import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrationsJson } from '../src/export';

/**
 * Writes migrations.json, the copy of MIGRATIONS that the desktop app (rusqlite, crates/desktop-core)
 * embeds at compile time. test/export.test.ts fails when the file is stale.
 */
const target = fileURLToPath(new URL('../migrations.json', import.meta.url));
writeFileSync(target, migrationsJson());
console.log(`wrote ${target}`);
