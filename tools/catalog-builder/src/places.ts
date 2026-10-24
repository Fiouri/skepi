import {
  classifyOsm,
  KIND_LABELS,
  PLACES_ATTRIBUTION,
  PLACES_DDL,
  PLACES_SCHEMA,
  placeSearchNames,
  type PlacesMeta,
} from '@skepi/core';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { REPO_ROOT } from './keys';

/**
 * Places pack builder (docs/architecture.md, "Offline maps"): OSM extract (PBF) → candidate objects
 * (places/osm_extract.py, pyosmium) → SQLite with an FTS5 index (`@skepi/core` PLACES_DDL). The
 * classification and the folded search names come from `@skepi/core`, so the app searches exactly
 * what was indexed. Rows are sorted by OSM type and id: the same extract gives the same file.
 */
export interface OsmCandidate {
  t: 'n' | 'w' | 'r';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface PlacesBuildOptions {
  /** ISO 3166-1 alpha-2 region of the extract, e.g. "GR". */
  region: string;
  /** Language of `name:<locale>` (local names), e.g. "el". */
  locale: string;
  /** Where the OSM data came from (shown in the pack's meta table). */
  source: string;
}

export interface PlacesBuildReport {
  rows: number;
  byCategory: Record<string, number>;
  skipped: number;
}

const TYPE_ORDER = { n: 0, w: 1, r: 2 } as const;

function isCandidate(v: unknown): v is OsmCandidate {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (o.t === 'n' || o.t === 'w' || o.t === 'r') &&
    Number.isSafeInteger(o.id) &&
    typeof o.lat === 'number' &&
    typeof o.lon === 'number' &&
    Math.abs(o.lat) <= 90 &&
    Math.abs(o.lon) <= 180 &&
    typeof o.tags === 'object' &&
    o.tags !== null
  );
}

export async function readCandidates(ndjsonPath: string): Promise<OsmCandidate[]> {
  const out: OsmCandidate[] = [];
  const lines = createInterface({ input: createReadStream(ndjsonPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let n = 0;
  for await (const line of lines) {
    n += 1;
    if (line.trim().length === 0) continue;
    const parsed: unknown = JSON.parse(line);
    if (!isCandidate(parsed)) throw new Error(`${ndjsonPath}:${String(n)}: not an OSM candidate`);
    out.push(parsed);
  }
  return out;
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Writes a places pack from candidate objects (atomic: `<out>.partial`, then rename). */
export async function writePlacesPack(candidates: readonly OsmCandidate[], out: string, opts: PlacesBuildOptions): Promise<PlacesBuildReport> {
  if (!/^[A-Z]{2}$/.test(opts.region)) throw new Error(`region must be ISO 3166-1 alpha-2: ${opts.region}`);
  if (!/^[a-z]{2,3}$/.test(opts.locale)) throw new Error(`locale must be a language code: ${opts.locale}`);
  const localeKey = `name:${opts.locale}`;
  const rows = candidates
    .flatMap((c) => {
      const cls = classifyOsm(c.tags);
      return cls ? [{ c, cls }] : [];
    })
    .sort((a, b) => TYPE_ORDER[a.c.t] - TYPE_ORDER[b.c.t] || a.c.id - b.c.id);
  const partial = `${out}.partial`;
  await rm(partial, { force: true });
  const db = new DatabaseSync(partial);
  const run = (sql: string): void => {
    db.prepare(sql).run();
  };
  const byCategory: Record<string, number> = {};
  try {
    run('PRAGMA page_size = 4096');
    run('PRAGMA journal_mode = OFF');
    run('PRAGMA synchronous = OFF');
    for (const ddl of PLACES_DDL) run(ddl);
    const meta: PlacesMeta = {
      schema: String(PLACES_SCHEMA),
      region: opts.region,
      locale: opts.locale,
      source: opts.source,
      license: 'ODbL-1.0',
      attribution: PLACES_ATTRIBUTION,
    };
    const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(meta) as [string, string][]) insertMeta.run(k, v);
    const insert = db.prepare(
      'INSERT INTO places (id, osm_type, osm_id, name, name_en, name_local, category, kind, importance, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertFts = db.prepare('INSERT INTO places_fts (rowid, names, kind) VALUES (?, ?, ?)');
    run('BEGIN');
    rows.forEach(({ c, cls }, i) => {
      const id = i + 1;
      const name = c.tags.name?.trim() ?? '';
      const nameEn = c.tags['name:en']?.trim() || null;
      const nameLocal = c.tags[localeKey]?.trim() || null;
      insert.run(id, c.t, c.id, name, nameEn, nameLocal, cls.category, cls.kind, cls.importance, round(c.lat), round(c.lon));
      insertFts.run(id, placeSearchNames([name, nameEn, nameLocal, c.tags.int_name]), KIND_LABELS[cls.kind] ?? cls.kind);
      byCategory[cls.category] = (byCategory[cls.category] ?? 0) + 1;
    });
    run('COMMIT');
    run("INSERT INTO places_fts (places_fts) VALUES ('optimize')");
    run('VACUUM');
  } finally {
    db.close();
  }
  await rename(partial, out);
  return { rows: rows.length, byCategory, skipped: candidates.length - rows.length };
}

function runTool(cmd: string, args: readonly string[], hint: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, [...args], { stdio: ['ignore', 'inherit', 'inherit'], shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${String(code)} (${hint})`));
    });
  });
}

/**
 * OSM tags of the candidate objects (places/osm_extract.py `candidate()`), as an `osmium tags-filter`
 * expression list. With osmium-tool (SKEPI_OSMIUM) the PBF is reduced to these objects and the nodes
 * and ways they reference before pyosmium reads it: the same candidates (test: places pre-filter), but
 * a country as large as the United States fits a CI runner's memory.
 */
export const OSMIUM_FILTERS = [
  'nwr/amenity=hospital,pharmacy,fire_station,police,drinking_water,water_point,shelter',
  'nwr/healthcare=hospital,pharmacy',
  'nwr/emergency=assembly_point',
  'nwr/tourism=alpine_hut,wilderness_hut',
  'nwr/natural=peak,spring',
  'nwr/place=city,town,village,hamlet,suburb,quarter,neighbourhood,locality,island,islet',
] as const;

export interface ExtractOsmOptions {
  /** Region GeoJSON (repository-relative): only candidates inside it are written. */
  boundary?: string;
  python?: string;
  /** osmium-tool binary for the pre-filter (default: SKEPI_OSMIUM, none when unset). */
  osmium?: string;
  log?: (line: string) => void;
}

/**
 * Runs places/osm_extract.py (pyosmium + shapely; `python -m pip install -r places/requirements.txt`),
 * after an optional `osmium tags-filter`. No shell.
 */
export async function extractOsm(pbf: string, ndjsonOut: string, locale: string, opts: ExtractOsmOptions = {}): Promise<void> {
  const script = join(REPO_ROOT, 'tools', 'catalog-builder', 'places', 'osm_extract.py');
  const python = opts.python ?? process.env.SKEPI_PYTHON ?? 'python';
  const osmium = opts.osmium ?? process.env.SKEPI_OSMIUM;
  if (!existsSync(pbf)) throw new Error(`missing OSM extract ${pbf}`);
  if (!/^[a-z]{2,3}$/.test(locale)) throw new Error(`locale must be a language code: ${locale}`);
  let input = pbf;
  if (osmium) {
    input = `${ndjsonOut}.filtered.osm.pbf`;
    opts.log?.(`> ${osmium} tags-filter ${pbf} … -o ${input}`);
    await runTool(osmium, ['tags-filter', pbf, ...OSMIUM_FILTERS, '--overwrite', '-o', input], 'osmium tags-filter');
  }
  const boundary = opts.boundary ? join(REPO_ROOT, opts.boundary) : null;
  if (boundary && !existsSync(boundary)) throw new Error(`missing boundary ${boundary}`);
  // Written beside the target and renamed: a cached candidate list is always a complete one.
  const partial = `${ndjsonOut}.partial`;
  try {
    await runTool(python, ['-I', script, input, partial, '--locale', locale, ...(boundary ? ['--boundary', boundary] : [])], 'are pyosmium and shapely installed? places/requirements.txt');
    await rename(partial, ndjsonOut);
  } finally {
    if (input !== pbf) await rm(input, { force: true });
    await rm(partial, { force: true });
  }
}
