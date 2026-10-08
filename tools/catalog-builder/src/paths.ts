import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where the dev tools keep downloaded and built files. The cache is the project's only copy of built
 * packs (map and places extracts of expiring Protomaps builds), so it must live somewhere Windows does
 * not clean: %LOCALAPPDATA%\skepi (Windows) or $XDG_CACHE_HOME/skepi, ~/.cache/skepi (elsewhere).
 * Phase 2a and earlier used %TEMP%\skepi; `catalog migrate-cache` moves those files with SHA-256 checks.
 */
export function skepiHome(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'skepi');
  return join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'skepi');
}

/** `SKEPI_CACHE_DIR` wins (CI sets it); otherwise `<skepiHome>/cache`. */
export function defaultCacheDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  return env.SKEPI_CACHE_DIR ?? join(skepiHome(env, platform), 'cache');
}

/** The pre-Phase 3a location (%TEMP%\skepi), only read by the migration. */
export function legacySkepiDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.TEMP ?? tmpdir(), 'skepi');
}

/**
 * The cache directory for a tool run. Warns once when files are still waiting in the legacy location,
 * so a run after the default changed does not silently download everything again.
 */
export function resolveCacheDir(override?: string, log: (line: string) => void = console.warn): string {
  const dir = override ?? defaultCacheDir();
  const legacy = join(legacySkepiDir(), 'cache');
  if (!override && !process.env.SKEPI_CACHE_DIR && legacy !== dir && existsSync(legacy)) {
    log(`note: files remain in the old cache ${legacy}; move them with: catalog migrate-cache`);
  }
  return dir;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const data of createReadStream(path, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) hash.update(data);
  return hash.digest('hex');
}

export interface MigratedFile {
  name: string;
  sizeBytes: number;
  sha256: string;
  /** moved: now only in the target · duplicate: identical file already there, source removed · conflict: different file already there, both kept. */
  result: 'moved' | 'duplicate' | 'conflict';
}

/**
 * Moves every regular file of `from` (recursively) into `to`. Each file is hashed before and after the
 * move; the source is removed only when the target's SHA-256 and size match. A rename is used on the
 * same volume, a copy to `<name>.migrating` + rename otherwise. Writes `to/MIGRATED-SHA256SUMS.txt`.
 * Unfinished downloads (`*.partial`) move too, so they can resume.
 */
export async function migrateDir(from: string, to: string, log: (line: string) => void): Promise<MigratedFile[]> {
  if (!existsSync(from)) return [];
  const results = await moveTree(from, to, log);
  const kept = results.filter((r) => r.result !== 'conflict');
  if (kept.length > 0) {
    const sums = kept.map((r) => `${r.sha256}  ${r.name}`).join('\n');
    await writeFile(join(to, 'MIGRATED-SHA256SUMS.txt'), `${sums}\n`, { flag: 'a' });
  }
  return results;
}

async function moveTree(from: string, to: string, log: (line: string) => void): Promise<MigratedFile[]> {
  const results: MigratedFile[] = [];
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      const nested = await moveTree(src, dst, log);
      results.push(...nested.map((f) => ({ ...f, name: `${entry.name}/${f.name}` })));
      continue;
    }
    if (!entry.isFile()) continue;
    const { size } = await stat(src);
    const before = await sha256File(src);
    if (existsSync(dst)) {
      const existing = await sha256File(dst);
      if (existing === before) {
        await rm(src);
        results.push({ name: entry.name, sizeBytes: size, sha256: before, result: 'duplicate' });
        log(`= ${entry.name} (already in ${to})`);
      } else {
        results.push({ name: entry.name, sizeBytes: size, sha256: before, result: 'conflict' });
        log(`! ${entry.name}: a different file exists in ${to}; both kept`);
      }
      continue;
    }
    const sameVolume = await renameIfSameVolume(src, dst);
    if (!sameVolume) {
      const temp = `${dst}.migrating`;
      await copyFile(src, temp);
      await rename(temp, dst);
    }
    const after = await sha256File(dst);
    const afterSize = (await stat(dst)).size;
    if (after !== before || afterSize !== size) {
      if (sameVolume) await rename(dst, src);
      else await rm(dst, { force: true });
      throw new Error(`${entry.name}: SHA-256 changed during the move (${before} -> ${after}); source kept`);
    }
    if (!sameVolume) await rm(src);
    results.push({ name: entry.name, sizeBytes: size, sha256: after, result: 'moved' });
    log(`> ${entry.name} (${String(size)} bytes, sha256 ${after})`);
  }
  if ((await readdir(from)).length === 0) await rm(from, { recursive: true });
  return results;
}

async function renameIfSameVolume(src: string, dst: string): Promise<boolean> {
  try {
    await rename(src, dst);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EXDEV') return false;
    throw e;
  }
}
