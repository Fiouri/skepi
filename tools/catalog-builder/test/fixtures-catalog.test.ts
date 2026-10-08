import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NO_SEQUENCE, pinnedKeys, trustedFromPinned, verifyCatalog, type SequenceState } from '@skepi/core';

/**
 * The committed catalogs (embedded debug/release, the local test mirror's good / wrong-key /
 * tampered / rollback) against catalog/verification-expectations.json. crates/desktop-core runs the
 * same file through its Rust port (tests/catalog_fixtures.rs): both implementations must agree.
 */
const repo = (p: string): string => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

interface Case {
  dir: string;
  keys: string;
  state: { sequence: number | null; sha256: string | null };
  expect: { ok: true; sequence: number; sha256: string } | { ok: false; reason: string };
}

const cases = (JSON.parse(readFileSync(repo('catalog/verification-expectations.json'), 'utf8')) as { cases: Case[] }).cases;

describe('catalog fixtures (shared with the Rust port)', () => {
  it.each(cases.map((c) => [`${c.dir} with ${c.keys}`, c] as const))('%s', (_, c) => {
    const bytes = readFileSync(repo(`${c.dir}/catalog.json`));
    const sig = readFileSync(repo(`${c.dir}/catalog.json.sig`), 'utf8');
    const trusted = trustedFromPinned(pinnedKeys(JSON.parse(readFileSync(repo(c.keys), 'utf8')) as Parameters<typeof pinnedKeys>[0]));
    const state: SequenceState = c.state.sequence === null ? NO_SEQUENCE : c.state;
    const r = verifyCatalog(new Uint8Array(bytes), sig, trusted, state);
    if (c.expect.ok) {
      expect(r.ok).toBe(true);
      if (r.ok) expect({ sequence: r.sequence, sha256: r.sha256 }).toEqual({ sequence: c.expect.sequence, sha256: c.expect.sha256 });
    } else {
      expect(r.ok ? 'ok' : r.reason).toBe(c.expect.reason);
    }
  });
});
