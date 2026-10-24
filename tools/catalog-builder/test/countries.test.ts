import { generateKeyPair, NO_SEQUENCE, packRegion, parseCatalog, verifyCatalog, type TrustedKey } from '@skepi/core';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, catalogSchema } from '../src/build';
import { countryManifest, readCountrySources, readRegionIndex, selectParts, type CountrySources, type RegionIndex } from '../src/countries';
import { REPO_ROOT } from '../src/keys';
import { parseManifest, type Manifest } from '../src/manifest';
import { compareWithReport, type PackReport } from '../src/pack';
import { OSMIUM_FILTERS } from '../src/places';

const index: RegionIndex = readRegionIndex();
const sources: CountrySources = readCountrySources();

describe('region index (catalog/regions, Natural Earth)', () => {
  it('one region file per country, every country with its Geofabrik extract and language', () => {
    expect(index.regions.length).toBeGreaterThan(230);
    for (const r of index.regions) {
      expect(r.iso2).toMatch(/^[A-Z]{2}$/);
      expect(existsSync(join(REPO_ROOT, 'catalog', 'regions', r.file))).toBe(true);
      for (const p of r.parts ?? []) expect(existsSync(join(REPO_ROOT, 'catalog', 'regions', p.file))).toBe(true);
    }
    for (const r of index.regions) {
      const src = sources.countries[r.iso2];
      expect(src?.geofabrik).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/);
      expect(src?.locale).toMatch(/^[a-z]{2,3}$/);
      for (const more of src?.geofabrikMore ?? []) expect(more).not.toBe(src?.geofabrik);
    }
    expect(Object.keys(sources.countries)).toHaveLength(index.regions.length);
  });
});

describe('countryManifest', () => {
  const manifest = countryManifest(index, sources, sources.pilot);

  it('a map pack (or parts) and a places pack per country, with region metadata', () => {
    const ids = manifest.packs.map((p) => p.id);
    expect(ids).toContain('map-gr');
    expect(ids).toContain('places-gr');
    expect(ids).toContain('map-cy');
    expect(ids).toContain('places-us');
    expect(ids.filter((i) => i.startsWith('map-us-')).length).toBeGreaterThan(5);
    expect(ids).not.toContain('map-us');
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of manifest.packs) {
      expect(p.region?.iso2).toBe(p.tags.find((t) => t.startsWith('region:'))?.slice('region:'.length));
      expect(p.urls).toEqual([`${sources.mirror}${p.file}`]);
      expect(p.license).toBe('ODbL-1.0');
      expect(p.attribution).toMatch(/OpenStreetMap contributors.*Natural Earth/);
    }
  });

  it('keeps the Greece pack ids (installed map-gr / places-gr become updates) and pins every input', () => {
    const gr = manifest.packs.filter((p) => p.region?.iso2 === 'GR');
    expect(gr.map((p) => p.id)).toEqual(['map-gr', 'places-gr']);
    const [map, places] = gr;
    expect(map?.source).toEqual({ kind: 'pmtiles-extract', buildUrl: 'https://build.protomaps.com/20261024.pmtiles', region: 'catalog/regions/gr.geojson', maxzoom: 15 });
    expect(places?.source).toEqual({
      kind: 'osm-places',
      url: 'https://download.geofabrik.de/europe/greece-261023.osm.pbf',
      upstreamMd5Url: 'https://download.geofabrik.de/europe/greece-261023.osm.pbf.md5',
      region: 'GR',
      locale: 'el',
      boundary: 'catalog/regions/gr.geojson',
    });
    expect(map?.title.el).toBe('Χάρτης: Ελλάδα');
    if (!map) throw new Error('map-gr');
    expect(packRegion(map)).toMatchObject({ iso2: 'GR', name: 'Greece', part: null });
  });

  it('parts of a split country carry their part (every subdivision, its own box) and the country box', () => {
    const us = manifest.packs.filter((p) => p.region?.iso2 === 'US' && p.kind === 'pmtiles');
    const country = index.regions.find((r) => r.iso2 === 'US');
    for (const p of us) {
      expect(p.region?.part?.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.region?.bbox).toEqual(country?.bbox);
      expect(p.region?.part?.bbox).toHaveLength(4);
      expect(p.title.en).toMatch(/^Map: United States of America — /);
    }
    // 50 states and the District of Columbia, each in exactly one part, named in full.
    const states = us.flatMap((p) => p.region?.part?.regions ?? []);
    expect(states).toHaveLength(51);
    expect(new Set(states).size).toBe(51);
    expect(us.find((p) => p.id === 'map-us-virginia')?.region?.part?.name).toBe('Virginia, Maryland, West Virginia, District of Columbia, Delaware');
    const bavaria = manifest.packs.find((p) => p.id === 'map-de-bavaria')?.region?.part;
    expect(bavaria?.regions).toEqual(expect.arrayContaining(['Bavaria', 'Bayern', 'Thuringia', 'Thüringen']));
    expect(manifest.packs.find((p) => p.id === 'map-jp-kanto')?.region?.part?.regions).toContain('Tokyo');
    for (const p of manifest.packs) expect(p.region?.part?.name ?? '').not.toMatch(/ and \d+ more$/);
  });

  it('selectParts: one part of a split country with its places pack (E2E test catalogs)', () => {
    const one = selectParts(countryManifest(index, sources, ['CY', 'JP']), ['JP:kanto']);
    expect(one.packs.map((p) => p.id)).toEqual(['map-cy', 'places-cy', 'map-jp-kanto', 'places-jp']);
    expect(() => selectParts(manifest, ['JP:tokyo'])).toThrow(/JP has no part tokyo/);
    expect(() => selectParts(manifest, ['jp:kanto'])).toThrow(/ISO:part/);
  });

  it('is a valid manifest (round trip through parseManifest)', () => {
    expect(parseManifest(JSON.stringify(manifest)).packs).toHaveLength(manifest.packs.length);
    expect(() => countryManifest(index, sources, ['XX'])).toThrow(/XX/);
    const others = Object.fromEntries(Object.entries(sources.countries).filter(([iso]) => iso !== 'FR'));
    expect(() => countryManifest(index, { ...sources, countries: others }, ['FR'])).toThrow(/Geofabrik/);
  });

  it('a country over several extracts: France with its overseas departments, each with its .md5', () => {
    const places = countryManifest(index, sources, ['FR']).packs.find((p) => p.id === 'places-fr');
    const source = places?.source;
    if (source?.kind !== 'osm-places') throw new Error('places-fr');
    expect(source.url).toBe('https://download.geofabrik.de/europe/france-261023.osm.pbf');
    expect(source.more).toEqual(expect.arrayContaining(['https://download.geofabrik.de/europe/france/reunion-261023.osm.pbf']));
    expect(parseManifest(JSON.stringify({ schema: 1, packs: [places] })).packs).toHaveLength(1);
    expect(() => parseManifest(JSON.stringify({ schema: 1, packs: [{ ...places, source: { ...source, more: [source.url] } }] }))).toThrow(/more/);
    expect(() => parseManifest(JSON.stringify({ schema: 1, packs: [{ ...places, source: { ...source, more: ['http://x/a.osm.pbf'] } }] }))).toThrow(/more/);
  });

  it('catalog/countries.json is the generated manifest of every country (regenerate with `catalog countries --all`)', () => {
    const committed = JSON.parse(readFileSync(join(REPO_ROOT, 'catalog', 'countries.json'), 'utf8')) as Manifest;
    expect(committed).toEqual(countryManifest(index, sources, index.regions.map((r) => r.iso2)));
  });
});

describe('schema 2 catalogs from the builder', () => {
  it('a pack with a region makes a schema 2 catalog the app verifies; without regions schema 1 stays', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skepi-countries-'));
    writeFileSync(join(dir, 'map-cy.pmtiles'), Buffer.alloc(70_000, 3));
    const cy = index.regions.find((r) => r.iso2 === 'CY');
    const region = { iso2: 'CY', name: 'Cyprus', bbox: cy?.bbox ?? [0, 0, 1, 1], center: cy?.center ?? [0, 0] } as const;
    const pack = {
      id: 'map-cy',
      kind: 'pmtiles',
      version: '2026-10-22',
      file: 'map-cy.pmtiles',
      title: { en: 'Map: Cyprus' },
      lang: ['en', 'el'],
      urls: ['https://127.0.0.1:8443/maps/map-cy.pmtiles'],
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      minTier: 'T0',
      tags: ['map', 'region:CY'],
      region,
      source: { kind: 'local', path: join(dir, 'map-cy.pmtiles') },
    };
    const keys = generateKeyPair();
    const trusted: TrustedKey[] = [{ keyId: 'cat-unit-a', publicKey: keys.publicKey }];
    const built = await buildCatalog({
      manifest: parseManifest(JSON.stringify({ schema: 1, packs: [pack] })),
      cacheDir: dir,
      key: { keyId: 'cat-unit-a', secretKey: keys.secretKey },
      previousSequence: null,
    });
    expect(built.catalog.schema).toBe(2);
    const verified = verifyCatalog(built.bytes, built.signature, trusted, NO_SEQUENCE);
    expect(verified.ok && verified.value.packs[0]?.region).toEqual(region);
    const plain: Record<string, unknown> = { ...pack };
    delete plain.region;
    const old = await buildCatalog({
      manifest: parseManifest(JSON.stringify({ schema: 1, packs: [plain] })),
      cacheDir: dir,
      key: { keyId: 'cat-unit-a', secretKey: keys.secretKey },
      previousSequence: null,
    });
    expect(old.catalog.schema).toBe(1);
    expect(catalogSchema(parseCatalog(JSON.parse(new TextDecoder().decode(old.bytes)) as unknown).packs)).toBe(1);
  });
});

describe('places pre-filter (osmium tags-filter) = osm_extract.py candidates', () => {
  // The expressions must select exactly the tags of candidate() in places/osm_extract.py.
  const py = readFileSync(join(REPO_ROOT, 'tools', 'catalog-builder', 'places', 'osm_extract.py'), 'utf8');
  const set = (name: string): string[] => {
    const m = py.match(new RegExp(`^${name} = \\{([^}]*)\\}`, 'm'));
    return [...(m?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? '').sort();
  };
  const filter = (key: string): string[] =>
    (OSMIUM_FILTERS.find((f) => f.startsWith(`nwr/${key}=`)) ?? '')
      .slice(`nwr/${key}=`.length)
      .split(',')
      .filter(Boolean)
      .sort();

  it('amenity and place values', () => {
    expect(filter('amenity')).toEqual(set('AMENITIES'));
    expect(filter('place')).toEqual(set('PLACES'));
  });

  it('the other candidate tags', () => {
    expect(py).toContain('tags.get("healthcare") in ("hospital", "pharmacy")');
    expect(filter('healthcare')).toEqual(['hospital', 'pharmacy']);
    expect(py).toContain('tags.get("emergency") == "assembly_point"');
    expect(filter('emergency')).toEqual(['assembly_point']);
    expect(py).toContain('tags.get("tourism") in ("alpine_hut", "wilderness_hut")');
    expect(filter('tourism')).toEqual(['alpine_hut', 'wilderness_hut']);
    expect(py).toContain('tags.get("natural") in ("peak", "spring")');
    expect(filter('natural')).toEqual(['peak', 'spring']);
    expect(OSMIUM_FILTERS).toHaveLength(6);
  });
});

describe('compareWithReport', () => {
  const pack = {
    id: 'map-cy',
    kind: 'pmtiles' as const,
    version: '2026-10-22',
    file: 'map-cy-20261022.pmtiles',
    title: { en: 'Map: Cyprus' },
    lang: ['en'],
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    chunkSize: 64,
    chunkSha256: ['a'.repeat(64)],
    urls: ['https://example.org/x.pmtiles'],
    license: 'ODbL-1.0',
    attribution: 'x',
    minTier: 'T0' as const,
    tags: [],
  };
  const report: PackReport = { schema: 1, pack, source: { kind: 'local', path: 'x' }, tools: {}, seconds: 1, builtAt: '' };
  it('same bytes: no problem; other bytes: named', () => {
    expect(compareWithReport(pack, report)).toEqual([]);
    expect(compareWithReport({ ...pack, sha256: 'b'.repeat(64) }, report)).toEqual([`SHA-256 ${'b'.repeat(64)} ≠ report ${'a'.repeat(64)}`]);
    expect(compareWithReport({ ...pack, sizeBytes: 11 }, report)).toEqual(['size 11 ≠ report 10']);
  });
});
