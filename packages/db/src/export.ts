import { MIGRATIONS } from './migrations';

/** The numbered migrations as JSON, byte-stable (desktop: embedded by crates/desktop-core). */
export function migrationsJson(): string {
  return `${JSON.stringify({ schema: 1, migrations: MIGRATIONS }, null, 2)}\n`;
}
