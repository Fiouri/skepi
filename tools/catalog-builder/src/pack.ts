import type { CatalogPack } from '@skepi/core';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';
import { measurePack, type MeasureOptions } from './build';
import { REPO_ROOT } from './keys';
import type { ManifestPack, PackSource } from './manifest';

/**
 * One pack built and measured on its own (CI: .github/workflows/packs.yml runs one job per pack), with
 * what the maintainer needs to review it before signing: file, size, SHA-256, chunk hashes, licence and
 * attribution, the pinned inputs and the versions of every tool that touched it.
 */
export interface PackReport {
  schema: 1;
  pack: CatalogPack;
  source: PackSource;
  tools: Record<string, string>;
  seconds: number;
  builtAt: string;
}

function firstLine(cmd: string, args: readonly string[]): string | null {
  const r = spawnSync(cmd, [...args], { encoding: 'utf8', shell: false, timeout: 60_000 });
  if (r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? null;
}

/** Versions of the tools a pack of this kind is built with (best effort: a missing tool is omitted). */
export function toolVersions(source: PackSource, pmtiles: string | null): Record<string, string> {
  const tools: Record<string, string> = {
    node: process.version,
    os: `${process.platform}-${process.arch} ${release()}`,
    'catalog-builder': (JSON.parse(readFileSync(join(REPO_ROOT, 'tools', 'catalog-builder', 'package.json'), 'utf8')) as { version: string }).version,
  };
  const git = firstLine('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD']);
  if (git) tools.commit = git;
  if (source.kind === 'pmtiles-extract' && pmtiles) {
    const v = firstLine(pmtiles, ['version']);
    if (v) tools.pmtiles = v;
  }
  if (source.kind === 'osm-places') {
    const python = process.env.SKEPI_PYTHON ?? 'python';
    const py = firstLine(python, ['-I', '-c', 'import sys, osmium.version as o, shapely; print(sys.version.split()[0], o.pyosmium_release, o.libosmium_version, shapely.__version__)']);
    if (py) {
      const [pythonVersion = '', pyosmium = '', libosmium = '', shapely = ''] = py.split(' ');
      Object.assign(tools, { python: pythonVersion, pyosmium, libosmium, shapely });
    }
    const osmium = process.env.SKEPI_OSMIUM;
    if (osmium) {
      const v = firstLine(osmium, ['--version']);
      if (v) tools['osmium-tool'] = v;
    }
  }
  return tools;
}

export async function buildPackReport(pack: ManifestPack, opts: MeasureOptions & { pmtiles: string | null }): Promise<PackReport> {
  const started = Date.now();
  const { pack: measured } = await measurePack(pack, opts);
  return {
    schema: 1,
    pack: measured,
    source: pack.source,
    tools: toolVersions(pack.source, opts.pmtiles),
    seconds: Math.round((Date.now() - started) / 1000),
    builtAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

/**
 * Checks a pack measured on this machine against the CI report of the same pack (`catalog prepare
 * --reports`): the maintainer signs only bytes that CI and the signing machine both measured.
 */
export function compareWithReport(local: CatalogPack, report: PackReport): string[] {
  const problems: string[] = [];
  const r = report.pack;
  if (r.id !== local.id) problems.push(`report is for ${r.id}`);
  if (r.file !== local.file) problems.push(`file ${local.file} ≠ report ${r.file}`);
  if (r.sizeBytes !== local.sizeBytes) problems.push(`size ${String(local.sizeBytes)} ≠ report ${String(r.sizeBytes)}`);
  if (r.sha256 !== local.sha256) problems.push(`SHA-256 ${local.sha256} ≠ report ${r.sha256}`);
  if (r.chunkSha256.join() !== local.chunkSha256.join()) problems.push('chunk hashes differ from the report');
  return problems;
}
