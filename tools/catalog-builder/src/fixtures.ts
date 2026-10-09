// Every file the test catalogs, test manifests and tests rely on must be committed. A fixture that only
// exists on one machine (ignored by `*.zim`) passed locally and failed CI (Phase 3a: the propagation ZIM
// whose SHA-256 the signed test catalogs pin). Run by `pnpm test` (test/fixtures-tracked.test.ts) in
// the `verify` CI job, and by `catalog check-fixtures`.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

export interface FixtureProblem {
  /** Repository-relative path of the referenced (or offending) file. */
  file: string;
  /** Where the reference comes from. */
  from: string;
  problem: string;
}

/** The local HTTPS test mirror (e2e/mirror/server.mjs) serves pack files from these directories. */
export const MIRROR_DIRS = ['e2e/fixtures', 'tools/rag-eval/fixtures'];
const MIRROR_PREFIX = 'https://127.0.0.1:8443/packs/';
/** Catalogs signed with the test key that the apps, tests and E2E download from the mirror. */
const TEST_CATALOG_GLOBS = ['catalog/embedded/debug', 'e2e/mirror/catalogs/*'];
/** Source files scanned for literal paths into a fixtures directory. */
const SOURCE_EXT = /\.(ts|tsx|mjs|js|rs|kt|ya?ml|ps1|py)$/;
const FIXTURE_LITERAL = /["'`]((?:[\w.@-]+\/)*fixtures\/[\w.@/-]+\.[A-Za-z0-9]+)["'`]/g;
/** Directories never walked when looking for fixture directories. */
const SKIP_DIRS = new Set(['node_modules', 'target', 'build', '.git', '.cxx', '.gradle', '.turbo', 'out', 'dist', '.cache', 'android', 'ios']);

interface CatalogPack {
  id: string;
  file: string;
  sizeBytes: number;
  sha256: string;
  urls?: string[];
}

interface ManifestPack {
  id: string;
  source?: { kind: string; path?: string };
}

export function trackedFiles(root: string): Set<string> {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Set(out.split('\0').filter(Boolean));
}

function expandGlob(root: string, pattern: string): string[] {
  if (!pattern.endsWith('/*')) return [pattern];
  const base = pattern.slice(0, -2);
  const dir = join(root, base);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${base}/${d.name}`);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Test catalogs: every pack the mirror serves is a committed file with the catalog's size and hash. */
function checkTestCatalogs(root: string, tracked: Set<string>, problems: FixtureProblem[]): void {
  for (const dir of TEST_CATALOG_GLOBS.flatMap((g) => expandGlob(root, g))) {
    const from = `${dir}/catalog.json`;
    if (!existsSync(join(root, from))) continue;
    const catalog = JSON.parse(readFileSync(join(root, from), 'utf8')) as { packs: CatalogPack[] };
    for (const pack of catalog.packs) {
      const mirrored = (pack.urls ?? []).filter((u) => u.startsWith(MIRROR_PREFIX)).map((u) => u.slice(MIRROR_PREFIX.length));
      for (const name of new Set(mirrored)) {
        const file = MIRROR_DIRS.map((d) => `${d}/${name}`).find((p) => tracked.has(p));
        if (!file) {
          problems.push({ file: name, from, problem: `pack ${pack.id}: not committed in ${MIRROR_DIRS.join(' or ')}` });
          continue;
        }
        const abs = join(root, file);
        if (!existsSync(abs)) {
          problems.push({ file, from, problem: `pack ${pack.id}: committed but missing from the working tree` });
          continue;
        }
        const size = statSync(abs).size;
        if (size !== pack.sizeBytes) problems.push({ file, from, problem: `pack ${pack.id}: ${String(size)} bytes, catalog says ${String(pack.sizeBytes)}` });
        else if (sha256(abs) !== pack.sha256) problems.push({ file, from, problem: `pack ${pack.id}: SHA-256 differs from the catalog` });
      }
    }
  }
}

/** Test manifests (catalog/test-*.json): local sources are committed files. */
function checkTestManifests(root: string, tracked: Set<string>, problems: FixtureProblem[]): void {
  if (!existsSync(join(root, 'catalog'))) return;
  for (const name of readdirSync(join(root, 'catalog')).filter((n) => /^test-.*\.json$/.test(n))) {
    const from = `catalog/${name}`;
    const manifest = JSON.parse(readFileSync(join(root, from), 'utf8')) as { packs: ManifestPack[] };
    for (const pack of manifest.packs) {
      const path = pack.source?.kind === 'local' ? pack.source.path : undefined;
      if (path && !tracked.has(path)) problems.push({ file: path, from, problem: `pack ${pack.id}: local source not committed` });
    }
  }
}

/** Literal paths into a fixtures directory in committed sources (tests, scripts, flows). */
function checkLiteralReferences(root: string, tracked: Set<string>, problems: FixtureProblem[]): void {
  for (const from of tracked) {
    if (!SOURCE_EXT.test(from) || from.includes('node_modules/')) continue;
    let text: string;
    try {
      text = readFileSync(join(root, from), 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(FIXTURE_LITERAL)) {
      const ref = m[1];
      // `..` segments are path-traversal test inputs, not references.
      if (ref === undefined || ref.split('/').includes('..')) continue;
      const candidates = [posix.normalize(ref), posix.normalize(posix.join(posix.dirname(from), ref))];
      if (candidates.some((c) => tracked.has(c))) continue;
      // A literal naming a fixtures directory entry that is neither committed nor on disk is a pattern or
      // an output name; one that exists on disk but is not committed is the failure this check exists for.
      const onDisk = candidates.find((c) => existsSync(join(root, c)));
      if (onDisk) problems.push({ file: onDisk, from, problem: 'referenced but not committed' });
    }
  }
}

/** Every file inside a `fixtures` directory of the working tree is committed. */
function checkFixtureDirectories(root: string, tracked: Set<string>, problems: FixtureProblem[]): void {
  const walk = (rel: string, inFixtures: boolean): void => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path, inFixtures || entry.name === 'fixtures');
      } else if (inFixtures && !tracked.has(path) && !entry.name.endsWith('.pyc')) {
        problems.push({ file: path, from: 'working tree', problem: 'file in a fixtures directory is not committed' });
      }
    }
  };
  walk('', false);
}

export function checkFixtures(root: string): FixtureProblem[] {
  const tracked = trackedFiles(root);
  const problems: FixtureProblem[] = [];
  checkTestCatalogs(root, tracked, problems);
  checkTestManifests(root, tracked, problems);
  checkLiteralReferences(root, tracked, problems);
  checkFixtureDirectories(root, tracked, problems);
  return problems;
}
