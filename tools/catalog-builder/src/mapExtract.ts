import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadTo } from './download';
import { REPO_ROOT } from './keys';

/**
 * Map packs: `pmtiles extract` of a pinned Protomaps daily build over a region GeoJSON. The CLI is the
 * pinned go-pmtiles release of scripts/content.lock.json (`pmtilesCli`, SHA-256 checked), the same one
 * scripts/provision.ps1 uses. Daily builds expire, so the extract is kept in the cache (our own copy).
 */
interface PmtilesCliLock {
  version: string;
  url: string;
  sha256: string;
}

/** The lock entry of this platform's build (`pmtilesCli`: Windows x86_64, `pmtilesCliLinux`: Linux x86_64, CI). */
function lockFor(lock: { pmtilesCli: PmtilesCliLock; pmtilesCliLinux?: PmtilesCliLock }): { lock: PmtilesCliLock; exe: string; archive: string } | null {
  if (process.platform === 'win32') return { lock: lock.pmtilesCli, exe: 'pmtiles.exe', archive: `go-pmtiles_${lock.pmtilesCli.version}_Windows_x86_64.zip` };
  if (process.platform === 'linux' && process.arch === 'x64' && lock.pmtilesCliLinux) {
    return { lock: lock.pmtilesCliLinux, exe: 'pmtiles', archive: `go-pmtiles_${lock.pmtilesCliLinux.version}_Linux_x86_64.tar.gz` };
  }
  return null;
}

function run(cmd: string, args: readonly string[], log: (line: string) => void): Promise<void> {
  log(`> ${cmd} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], { stdio: ['ignore', 'inherit', 'inherit'], shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${String(code)}`));
    });
  });
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) h.update(chunk);
  return h.digest('hex');
}

/** The pinned pmtiles CLI: SKEPI_PMTILES, or downloaded and checked into `<cache>/pmtiles-<version>/`. */
export async function pmtilesCli(cacheDir: string, log: (line: string) => void): Promise<string> {
  const fromEnv = process.env.SKEPI_PMTILES;
  if (fromEnv) return fromEnv;
  const locks = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts', 'content.lock.json'), 'utf8')) as { pmtilesCli: PmtilesCliLock; pmtilesCliLinux?: PmtilesCliLock };
  const pinned = lockFor(locks);
  if (!pinned) throw new Error(`no pinned pmtiles CLI for ${process.platform}-${process.arch}: set SKEPI_PMTILES to a go-pmtiles ${locks.pmtilesCli.version} binary`);
  const { lock } = pinned;
  const dir = join(cacheDir, `pmtiles-${lock.version}`);
  const exe = join(dir, pinned.exe);
  if (existsSync(exe)) return exe;
  const zip = await downloadTo(lock.url, join(cacheDir, pinned.archive), log);
  const digest = await sha256File(zip);
  if (digest !== lock.sha256) throw new Error(`pmtiles CLI archive SHA-256 ${digest} does not match the lock (${lock.sha256})`);
  await mkdir(dir, { recursive: true });
  // Windows 10+ ships bsdtar, which reads zip archives (named by path: Git Bash's GNU tar reads
  // "C:" as a remote host); Linux tar reads the .tar.gz.
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  await run(tar, ['-xf', zip, '-C', dir], log);
  if (!existsSync(exe)) throw new Error(`${exe} missing after extracting ${zip}`);
  return exe;
}

export interface ExtractOptions {
  buildUrl: string;
  /** Region GeoJSON, relative to the repository root. */
  region: string;
  maxzoom: number;
  out: string;
  cacheDir: string;
  log: (line: string) => void;
}

/** Extracts the region (atomic: `<out>.partial`, then rename). Reuses an existing `out`. */
export async function extractMap(opts: ExtractOptions): Promise<string> {
  if (existsSync(opts.out)) return opts.out;
  const region = join(REPO_ROOT, opts.region);
  if (!existsSync(region)) throw new Error(`missing region ${region}`);
  const exe = await pmtilesCli(opts.cacheDir, opts.log);
  const partial = `${opts.out}.partial`;
  await rm(partial, { force: true });
  try {
    await run(exe, ['extract', opts.buildUrl, partial, `--region=${region}`, `--maxzoom=${String(opts.maxzoom)}`], opts.log);
  } catch (e) {
    await rm(partial, { force: true });
    throw new Error(`pmtiles extract failed (Protomaps daily builds expire: pick a current build): ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  await rename(partial, opts.out);
  return opts.out;
}
