import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogPack, PackRegion } from '../src/catalog';
import {
  bboxContains,
  countryAt,
  countryDownloads,
  countryInstalledIds,
  distanceKm,
  filterCountries,
  fitZoom,
  installedRegions,
  LEGACY_HOME,
  listCountries,
  mapHome,
  packRegion,
  type CountryEntry,
  type InstalledLike,
} from '../src/regions';
import { BASE_SOURCE, multiSourceStyle, type StyleLike } from '../src/mapStyle';
import { checkStorage, requiredFreeBytes } from '../src/storage';
import { nearestSettlementKm, type PlacesQuery } from '../src/places';

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const H = (c: string): string => c.repeat(64);

const CY: PackRegion = { iso2: 'CY', name: 'Cyprus', bbox: [32.2225, 34.5224, 34.642, 35.7405], center: [33.0842, 34.9133] };
const US: PackRegion = { iso2: 'US', name: 'United States of America', bbox: [172.4262, 18.8564, -66.9282, 71.4605], center: [-97.4826, 39.5385] };
const TR: PackRegion = { iso2: 'TR', name: 'Turkey', bbox: [25.6161, 35.7703, 44.8569, 42.1483], center: [34.5083, 39.3454] };

function pack(id: string, kind: CatalogPack['kind'], sizeMb: number, extra: Partial<CatalogPack> = {}): CatalogPack {
  return {
    id,
    kind,
    version: '2026-10-22',
    file: `${id}.${kind === 'pmtiles' ? 'pmtiles' : kind === 'places' ? 'sqlite' : 'zim'}`,
    title: { en: id },
    lang: ['en'],
    sizeBytes: sizeMb * MB,
    sha256: H('a'),
    chunkSize: 64 * MB,
    chunkSha256: [H('a')],
    urls: [`https://example.org/${id}`],
    license: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    minTier: 'T0',
    tags: [],
    ...extra,
  };
}

// The release catalog up to sequence 3 (schema 1: Greece only as a `region:GR` tag) plus schema 2 countries.
const GR_MAP_OLD = pack('map-gr', 'pmtiles', 507, {
  version: '2026-10-05',
  sha256: H('1'),
  title: { en: 'Map: Greece (offline, zoom 15)', el: 'Χάρτης: Ελλάδα' },
  tags: ['map', 'default', 'region:GR'],
});
const GR_PLACES_OLD = pack('places-gr', 'places', 5, {
  version: '2026-10-04',
  sha256: H('2'),
  title: { en: 'Places and emergency points: Greece' },
  tags: ['places', 'default', 'region:GR'],
});
const CATALOG: Catalog = {
  schema: 2,
  sequence: 4,
  issuedAt: '2026-10-23T00:00:00Z',
  keyId: 'cat-test-2026a',
  packs: [
    pack('wikipedia_en_top_mini', 'zim', 283),
    { ...GR_MAP_OLD, version: '2026-10-22', sha256: H('3') },
    GR_PLACES_OLD,
    pack('map-cy', 'pmtiles', 56, { region: CY }),
    pack('places-cy', 'places', 3, { region: CY }),
    pack('map-us-west', 'pmtiles', 1400, { region: { ...US, part: { id: 'west', name: 'Pacific, Mountain' } } }),
    pack('map-us-alaska', 'pmtiles', 900, { region: { ...US, part: { id: 'alaska', name: 'Alaska' } } }),
    pack('places-us', 'places', 150, { region: US }),
    pack('map-tr', 'pmtiles', 1300, { region: TR }),
  ],
};
const installed = (p: CatalogPack, sha256 = p.sha256): InstalledLike => ({ id: p.id, kind: p.kind, version: p.version, sha256, verified: true });
const byId = (id: string): CatalogPack => {
  const p = CATALOG.packs.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};
const country = (list: readonly CountryEntry[], iso2: string): CountryEntry => {
  const c = list.find((x) => x.iso2 === iso2);
  if (!c) throw new Error(iso2);
  return c;
};

describe('packRegion', () => {
  it('schema 2 region, or the schema 1 tag with the name from the title (Greece migration)', () => {
    expect(packRegion(pack('map-cy', 'pmtiles', 1, { region: CY }))).toEqual({ ...CY, part: null });
    expect(packRegion(GR_MAP_OLD)).toEqual({ iso2: 'GR', name: 'Greece', bbox: [19.5766, 34.7666, 28.2898, 41.7996], center: [21.7346, 38.2466], part: null });
    expect(packRegion(GR_PLACES_OLD)?.name).toBe('Greece');
    expect(packRegion(pack('map-xx', 'pmtiles', 1, { tags: ['region:XX'], title: { en: 'Map: Somewhere' } }))).toMatchObject({ iso2: 'XX', name: 'Somewhere', bbox: null });
    expect(packRegion(pack('wikipedia', 'zim', 1, { tags: ['region:GR'] }))).toBeNull();
    expect(packRegion(pack('map-none', 'pmtiles', 1))).toBeNull();
  });
});

describe('listCountries', () => {
  it('groups map parts and places per country, sorted by name, with sizes', () => {
    const list = listCountries(CATALOG, []);
    expect(list.map((c) => c.iso2)).toEqual(['CY', 'GR', 'TR', 'US']);
    const us = list.find((c) => c.iso2 === 'US');
    expect(us?.maps.map((m) => m.pack.id)).toEqual(['map-us-alaska', 'map-us-west']);
    expect(us?.places?.pack.id).toBe('places-us');
    expect(us?.sizeBytes).toBe((1400 + 900 + 150) * MB);
    expect(us?.status).toBe('available');
    expect(list.find((c) => c.iso2 === 'TR')?.places).toBeNull();
    expect(listCountries(null, [])).toEqual([]);
  });

  it('migration: the Greece packs installed from a schema 1 catalog are found, a newer map is an update', () => {
    const gr = country(listCountries(CATALOG, [installed(GR_MAP_OLD), installed(GR_PLACES_OLD)]), 'GR');
    expect(gr.status).toBe('update');
    expect(gr.maps[0]?.update).toBe(true);
    expect(gr.places?.update).toBe(false);
    expect(gr.missingBytes).toBe(507 * MB);
    expect(countryDownloads(gr).map((p) => p.id)).toEqual(['map-gr']);
    expect(countryInstalledIds(gr)).toEqual(['map-gr', 'places-gr']);
  });

  it('installed, partial and unverified states', () => {
    const cy = CATALOG.packs.filter((p) => p.region?.iso2 === 'CY');
    expect(listCountries(CATALOG, cy.map((p) => installed(p))).find((c) => c.iso2 === 'CY')?.status).toBe('installed');
    const part = listCountries(CATALOG, [installed(byId('map-us-west'))]).find((c) => c.iso2 === 'US');
    expect(part?.status).toBe('partial');
    expect(part?.missingBytes).toBe((900 + 150) * MB);
    // An unverified file with other bytes is not offered as an update (it never opens anyway).
    const unverified = { ...installed(GR_MAP_OLD), verified: false };
    expect(listCountries(CATALOG, [unverified]).find((c) => c.iso2 === 'GR')?.maps[0]?.update).toBe(false);
  });

  it('downloads of chosen parts of a split country, always with its places pack', () => {
    const us = country(listCountries(CATALOG, []), 'US');
    expect(countryDownloads(us, ['west']).map((p) => p.id)).toEqual(['map-us-west', 'places-us']);
    expect(countryDownloads(us).map((p) => p.id)).toEqual(['map-us-alaska', 'map-us-west', 'places-us']);
  });

  it('filters by folded name or ISO code', () => {
    const list = listCountries(CATALOG, []);
    expect(filterCountries(list, 'cyp').map((c) => c.iso2)).toEqual(['CY']);
    expect(filterCountries(list, 'GREE').map((c) => c.iso2)).toEqual(['GR']);
    expect(filterCountries(list, 'us').map((c) => c.iso2)).toEqual(['CY', 'US']); // Cyprus contains 'us'
    expect(filterCountries(list, '  ')).toHaveLength(4);
    expect(filterCountries(list, 'atlantis')).toEqual([]);
  });

  it('installedRegions: verified map and places packs the catalog knows', () => {
    const regions = installedRegions(CATALOG, [installed(GR_MAP_OLD), { ...installed(byId('map-cy')), verified: false }, installed(byId('wikipedia_en_top_mini'))]);
    expect([...regions.keys()]).toEqual(['map-gr']);
  });
});

describe('countryAt (emergency number of the current position)', () => {
  it('boxes across the antimeridian', () => {
    expect(bboxContains(US.bbox, 61.2, -149.9)).toBe(true); // Anchorage
    expect(bboxContains(US.bbox, 52.9, 173.2)).toBe(true); // Attu
    expect(bboxContains(US.bbox, 48.1, 11.6)).toBe(false); // Munich
    expect(bboxContains(CY.bbox, 35.17, 33.36)).toBe(true);
  });

  it('one box: that country unless its places pack has no settlement near', () => {
    expect(countryAt(35.17, 33.36, [{ ...CY }])).toBe('CY');
    expect(countryAt(35.17, 33.36, [{ ...CY, nearestKm: 2 }])).toBe('CY');
    expect(countryAt(35.17, 33.36, [{ ...CY, nearestKm: null }])).toBeNull();
    expect(countryAt(48.1, 11.6, [{ ...CY }])).toBeNull();
  });

  it('overlapping boxes: the nearest settlement decides (the US box spans the Pacific and Europe-free latitudes)', () => {
    // Istanbul: inside the boxes of Turkey and (wrapping) the United States? No: Europe is outside the US box.
    expect(countryAt(41.0, 28.98, [{ ...US, nearestKm: null }, { ...TR, nearestKm: 0.4 }])).toBe('TR');
    // Kos / Bodrum: inside the boxes of Greece and Turkey; the nearest settlement wins.
    const GR = { iso2: 'GR', bbox: [19.5766, 34.7666, 28.2898, 41.7996] as [number, number, number, number] };
    expect(countryAt(37.03, 27.35, [{ ...TR, nearestKm: 9 }, { ...GR, nearestKm: 1.5 }])).toBe('GR');
    expect(countryAt(37.03, 27.42, [{ ...TR, nearestKm: 1 }, { ...GR, nearestKm: 4 }])).toBe('TR');
    // No places packs: the smallest box.
    expect(countryAt(37.03, 27.35, [{ ...TR }, { ...GR }])).toBe('GR');
    // Settlements too far everywhere; a box without places data still counts.
    expect(countryAt(37.03, 27.35, [{ ...TR, nearestKm: 80 }, { ...GR }])).toBe('GR');
    expect(countryAt(37.03, 27.35, [{ ...TR, nearestKm: 80 }, { ...GR, nearestKm: null }])).toBeNull();
  });

  it('nearestSettlementKm: settlements of the places pack around the position', async () => {
    const seen: (string | number)[][] = [];
    const rows = [
      { lat: 35.1856, lon: 33.3823 }, // Nicosia
      { lat: 34.9167, lon: 33.6333 }, // Larnaca
    ];
    const query: PlacesQuery = (sql, params) => {
      seen.push([...params]);
      expect(sql).toMatch(/category = 'settlement'/);
      return Promise.resolve(rows);
    };
    const km = await nearestSettlementKm(query, 35.17, 33.36);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(3);
    expect(seen[0]?.[0]).toBeCloseTo(35.17 - 50 / 111, 6);
    expect(await nearestSettlementKm(() => Promise.resolve([]), 35.17, 33.36)).toBeNull();
    expect(await nearestSettlementKm(() => Promise.resolve([{ lat: 36.5, lon: 33.36 }]), 35.17, 33.36)).toBeNull();
  });

  it('mapHome: the chosen country, else the first; legacy Greece on Patras', () => {
    const cy = { ...CY, part: null };
    const gr = packRegion(GR_MAP_OLD);
    if (!gr) throw new Error('gr');
    expect(mapHome([cy, gr], 'GR')).toEqual(LEGACY_HOME);
    expect(mapHome([cy, gr], 'DE')).toEqual({ center: CY.center, zoom: 7 });
    expect(mapHome([], null)).toEqual(LEGACY_HOME);
  });

  it('fitZoom: a country fills the screen', () => {
    expect(fitZoom(CY.bbox)).toBe(7);
    expect(fitZoom([19.5766, 34.7666, 28.2898, 41.7996])).toBe(5);
    expect(fitZoom(US.bbox)).toBe(3);
    expect(fitZoom([7.4, 43.72, 7.44, 43.76])).toBe(10);
  });

  it('distanceKm (haversine)', () => {
    expect(distanceKm(38.2466, 21.7346, 38.2466, 21.7346)).toBe(0);
    expect(distanceKm(37.9838, 23.7275, 40.6401, 22.9444)).toBeCloseTo(302.5, 0); // Athens – Thessaloniki
  });
});

describe('multiSourceStyle (all installed countries in one style)', () => {
  const base: StyleLike = {
    version: 8,
    glyphs: 'asset://map/fonts/{fontstack}/{range}.pbf',
    sources: { protomaps: { type: 'vector', url: 'pmtiles://__PMTILES_FILE__', attribution: '© OpenStreetMap contributors' } },
    layers: [
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water' },
      { id: 'roads', type: 'line', source: 'protomaps', 'source-layer': 'roads' },
    ],
  };

  it('one pack: the bundled style with its tiles URL (Greece renders as before)', () => {
    const style = multiSourceStyle(base, [{ id: 'map-gr', url: 'pmtiles://file:///data/maps/map-gr.pmtiles' }]);
    expect(style).toEqual({ ...base, sources: { protomaps: { ...base.sources.protomaps, url: 'pmtiles://file:///data/maps/map-gr.pmtiles' } } });
    expect(base.sources.protomaps?.url).toBe('pmtiles://__PMTILES_FILE__');
  });

  it('several packs: a source each, layers repeated in style order, one attribution', () => {
    const style = multiSourceStyle(base, [
      { id: 'map-gr', url: 'pmtiles://file:///gr.pmtiles' },
      { id: 'map-cy', url: 'pmtiles://file:///cy.pmtiles' },
    ]);
    expect(Object.keys(style?.sources ?? {})).toEqual([BASE_SOURCE, 'protomaps:map-cy']);
    expect(style?.sources['protomaps:map-cy']).toEqual({ type: 'vector', url: 'pmtiles://file:///cy.pmtiles' });
    expect(style?.layers.map((l) => [l.id, l.source])).toEqual([
      ['background', undefined],
      ['water', 'protomaps'],
      ['water:map-cy', 'protomaps:map-cy'],
      ['roads', 'protomaps'],
      ['roads:map-cy', 'protomaps:map-cy'],
    ]);
    expect(new Set(style?.layers.map((l) => l.id)).size).toBe(style?.layers.length);
  });

  it('no pack: null; a style without the protomaps vector source: error', () => {
    expect(multiSourceStyle(base, [])).toBeNull();
    expect(() => multiSourceStyle({ sources: {}, layers: [] }, [{ id: 'a', url: 'x' }])).toThrow(/protomaps/);
  });
});

describe('checkStorage (T1 storage warnings)', () => {
  it('ContentStore rule: size + 10% + 1 GB', () => {
    expect(requiredFreeBytes(1000)).toBe(1000 + 100 + GB);
    expect(requiredFreeBytes(1005)).toBe(1005 + 100 + GB);
    expect(checkStorage({ sizeBytes: GB, freeBytes: 2.2 * GB, tier: 'T2' })).toMatchObject({ ok: true, warnings: [] });
    expect(checkStorage({ sizeBytes: GB, freeBytes: 2 * GB, tier: 'T2' }).ok).toBe(false);
  });

  it('T0/T1: warns before a large download or one that leaves less than 4 GB free', () => {
    expect(checkStorage({ sizeBytes: 1.5 * GB, freeBytes: 20 * GB, tier: 'T1' }).warnings).toEqual(['large-download']);
    expect(checkStorage({ sizeBytes: 500 * MB, freeBytes: 4 * GB, tier: 'T1' }).warnings).toEqual(['low-space-after']);
    expect(checkStorage({ sizeBytes: 500 * MB, freeBytes: 20 * GB, tier: 'T0' }).warnings).toEqual([]);
    expect(checkStorage({ sizeBytes: 1.5 * GB, freeBytes: 3 * GB, tier: 'T2' }).warnings).toEqual([]);
    expect(checkStorage({ sizeBytes: 1.5 * GB, freeBytes: 3 * GB, tier: null }).warnings).toEqual([]);
  });
});
