import type { PackRegion } from '@skepi/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './keys';
import type { Manifest, ManifestPack } from './manifest';

/**
 * Country map and places packs (global maps, decision 2026-10-23): the manifest entries of every
 * country are generated from the region index (catalog/regions/index.json, Natural Earth) and the
 * pinned inputs (catalog/regions/sources.json: Protomaps build, Geofabrik extract date and path per
 * country), so adding a country is a line in sources.json, not hand-written JSON.
 */
export interface RegionIndexEntry {
  iso2: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
  file: string;
  parts?: { id: string; name: string; file: string; maxzoom: number }[];
  measured?: Record<string, { build: string; bytes: number; tiles: number | null }>;
}

export interface RegionIndex {
  naturalEarth: { version: string; license: string };
  regions: RegionIndexEntry[];
}

export interface CountrySources {
  protomaps: { build: string; basemapVersion: string };
  geofabrik: { date: string };
  /** Mirror (GitHub release) the packs are uploaded to; `<mirror><file>` is each pack's URL. */
  mirror: string;
  countries: Record<string, { geofabrik: string; locale: string; title?: { el?: string } }>;
  pilot: string[];
}

export function readRegionIndex(path = join(REPO_ROOT, 'catalog', 'regions', 'index.json')): RegionIndex {
  return JSON.parse(readFileSync(path, 'utf8')) as RegionIndex;
}

export function readCountrySources(path = join(REPO_ROOT, 'catalog', 'regions', 'sources.json')): CountrySources {
  return JSON.parse(readFileSync(path, 'utf8')) as CountrySources;
}

const ISO2 = /^[A-Z]{2}$/;

/** `261022` (Geofabrik) → `2026-10-22`. */
function geofabrikDate(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) throw new Error(`geofabrik.date must be YYMMDD: ${yymmdd}`);
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

/** `20261022` (Protomaps) → `2026-10-22`. */
function protomapsDate(build: string): string {
  if (!/^\d{8}$/.test(build)) throw new Error(`protomaps.build must be YYYYMMDD: ${build}`);
  return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)}`;
}

/** Manifest entries (map pack or parts, places pack) of the given countries. */
export function countryManifest(index: RegionIndex, sources: CountrySources, isoCodes: readonly string[]): Manifest {
  const packs: ManifestPack[] = [];
  const build = sources.protomaps.build;
  const mapVersion = protomapsDate(build);
  const placesVersion = geofabrikDate(sources.geofabrik.date);
  const placesStamp = placesVersion.replace(/-/g, '');
  if (!sources.mirror.startsWith('https://') || !sources.mirror.endsWith('/')) throw new Error('mirror must be an https:// URL ending in /');
  const boundaryNote = `boundary: Natural Earth ${index.naturalEarth.version} (public domain)`;
  for (const iso2 of isoCodes) {
    if (!ISO2.test(iso2)) throw new Error(`not an ISO 3166-1 alpha-2 code: ${iso2}`);
    const entry = index.regions.find((r) => r.iso2 === iso2);
    if (!entry) throw new Error(`${iso2}: not in catalog/regions/index.json`);
    const src = sources.countries[iso2];
    if (!src) throw new Error(`${iso2}: no Geofabrik extract in catalog/regions/sources.json`);
    const lower = iso2.toLowerCase();
    const region: PackRegion = { iso2, name: entry.name, bbox: entry.bbox, center: entry.center };
    const lang = [...new Set(['en', src.locale])];
    const mapAttribution = `© OpenStreetMap contributors · Protomaps basemap ${sources.protomaps.basemapVersion} (build ${build}) · ${boundaryNote}`;
    const maps = entry.parts && entry.parts.length > 0 ? entry.parts : [{ id: null, name: null, file: entry.file, maxzoom: 15 }];
    for (const part of maps) {
      const id = part.id ? `map-${lower}-${part.id}` : `map-${lower}`;
      const file = `${id}-${build}.pmtiles`;
      const zoom = part.maxzoom === 15 ? '' : ` (zoom ${String(part.maxzoom)})`;
      const title = part.name ? `Map: ${entry.name} — ${part.name}${zoom}` : `Map: ${entry.name}${zoom}`;
      packs.push({
        id,
        kind: 'pmtiles',
        version: mapVersion,
        file,
        title: { en: title, ...(src.title?.el && !part.name ? { el: `Χάρτης: ${src.title.el}` } : {}) },
        lang,
        urls: [`${sources.mirror}${file}`],
        license: 'ODbL-1.0',
        attribution: mapAttribution,
        minTier: 'T0',
        tags: ['map', `region:${iso2}`],
        region: part.id && part.name ? { ...region, part: { id: part.id, name: part.name } } : region,
        source: { kind: 'pmtiles-extract', buildUrl: `https://build.protomaps.com/${build}.pmtiles`, region: `catalog/regions/${part.file}`, maxzoom: part.maxzoom },
      });
    }
    const pbf = `https://download.geofabrik.de/${src.geofabrik}-${sources.geofabrik.date}.osm.pbf`;
    const placesFile = `places-${lower}-${placesStamp}.sqlite`;
    packs.push({
      id: `places-${lower}`,
      kind: 'places',
      version: placesVersion,
      file: placesFile,
      title: { en: `Places and emergency points: ${entry.name}`, ...(src.title?.el ? { el: `Τοποθεσίες και σημεία έκτακτης ανάγκης: ${src.title.el}` } : {}) },
      lang,
      urls: [`${sources.mirror}${placesFile}`],
      license: 'ODbL-1.0',
      attribution: `© OpenStreetMap contributors (Geofabrik extract ${placesVersion}) · ${boundaryNote}`,
      minTier: 'T0',
      tags: ['places', `region:${iso2}`],
      region,
      source: { kind: 'osm-places', url: pbf, upstreamMd5Url: `${pbf}.md5`, region: iso2, locale: src.locale, boundary: `catalog/regions/${entry.file}` },
    });
  }
  return {
    schema: 1,
    description:
      'Country map and places packs, generated by `catalog countries` from catalog/regions/index.json (Natural Earth) and catalog/regions/sources.json (pinned Protomaps build and Geofabrik extracts). Built per pack in CI (.github/workflows/packs.yml), mirrored as GitHub release assets, signed offline by the maintainer.',
    packs,
  };
}
