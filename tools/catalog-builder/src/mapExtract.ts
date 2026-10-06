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
  const lock = (JSON.parse(readFileSync(join(REPO_ROOT, 'scripts', 'content.lock.json'), 'utf8')) as { pmtilesCli: PmtilesCliLock }).pmtilesCli;
  if (process.platform !== 'win32') throw new Error('the pinned pmtiles CLI is the Windows build: set SKEPI_PMTILES to a go-pmtiles ' + lock.version + ' binary');
  const dir = join(cacheDir, `pmtiles-${lock.version}`);
  const exe = join(dir, 'pmtiles.exe');
  if (existsSync(exe)) return exe;
  const zip = await downloadTo(lock.url, join(cacheDir, `go-pmtiles_${lock.version}_Windows_x86_64.zip`), log);
  const digest = await sha256File(zip);
  if (digest !== lock.sha256) throw new Error(`pmtiles CLI zip SHA-256 ${digest} does not match the lock (${lock.sha256})`);
  await mkdir(dir, { recursive: true });
  // Windows 10+ ships bsdtar, which reads zip archives.
  await run('tar', ['-xf', zip, '-C', dir], log);
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
