import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultCacheDir, migrateDir, sha256File, skepiHome } from '../src/paths';

const root = mkdtempSync(join(tmpdir(), 'skepi-paths-'));

describe('cache location', () => {
  it('defaults to %LOCALAPPDATA%\\skepi\\cache on Windows, never %TEMP%', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', TEMP: 'C:\\Users\\u\\AppData\\Local\\Temp' };
    expect(defaultCacheDir(env, 'win32')).toBe(join('C:\\Users\\u\\AppData\\Local', 'skepi', 'cache'));
    expect(skepiHome(env, 'win32')).not.toContain('Temp');
  });

  it('uses XDG_CACHE_HOME elsewhere and SKEPI_CACHE_DIR everywhere', () => {
    expect(defaultCacheDir({ XDG_CACHE_HOME: '/x' }, 'linux')).toBe(join('/x', 'skepi', 'cache'));
    expect(defaultCacheDir({ SKEPI_CACHE_DIR: '/ci/cache', LOCALAPPDATA: 'C:\\L' }, 'win32')).toBe('/ci/cache');
  });
});

describe('migrateDir', () => {
  it('moves files with matching SHA-256, keeps conflicts and records the sums', async () => {
    const from = join(root, 'old');
    const to = join(root, 'new');
    mkdirSync(join(from, 'nested'), { recursive: true });
    mkdirSync(to, { recursive: true });
    writeFileSync(join(from, 'a.pmtiles'), 'map bytes');
    writeFileSync(join(from, 'nested', 'b.sqlite'), 'places bytes');
    writeFileSync(join(from, 'same.zim'), 'same');
    writeFileSync(join(to, 'same.zim'), 'same');
    writeFileSync(join(from, 'clash.gguf'), 'old model');
    writeFileSync(join(to, 'clash.gguf'), 'other model');
    const expectedA = await sha256File(join(from, 'a.pmtiles'));

    const results = await migrateDir(from, to, () => undefined);

    const byName = Object.fromEntries(results.map((r) => [r.name, r.result]));
    expect(byName).toEqual({ 'a.pmtiles': 'moved', 'nested/b.sqlite': 'moved', 'same.zim': 'duplicate', 'clash.gguf': 'conflict' });
    expect(await sha256File(join(to, 'a.pmtiles'))).toBe(expectedA);
    expect(readFileSync(join(to, 'nested', 'b.sqlite'), 'utf8')).toBe('places bytes');
    expect(existsSync(join(from, 'a.pmtiles'))).toBe(false);
    expect(existsSync(join(from, 'same.zim'))).toBe(false);
    // A different file of the same name is never overwritten or deleted.
    expect(readFileSync(join(from, 'clash.gguf'), 'utf8')).toBe('old model');
    expect(readFileSync(join(to, 'clash.gguf'), 'utf8')).toBe('other model');
    const sums = readFileSync(join(to, 'MIGRATED-SHA256SUMS.txt'), 'utf8');
    expect(sums).toContain(`${expectedA}  a.pmtiles`);
    expect(sums).not.toContain('clash.gguf');
  });

  it('does nothing when the old cache does not exist', async () => {
    expect(await migrateDir(join(root, 'missing'), join(root, 'target'), () => undefined)).toEqual([]);
    expect(existsSync(join(root, 'target'))).toBe(false);
  });
});
