import { EMERGENCY_CATEGORIES, emergencyPois, placeTitle, readPlacesMeta, searchPlaces, type PlacesQuery } from '@skepi/core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { readCandidates, writePlacesPack } from '../src/places';

const dir = mkdtempSync(join(tmpdir(), 'skepi-places-'));
const fixture = join(import.meta.dirname, 'fixtures', 'osm-candidates.ndjson');

async function build(name: string): Promise<{ path: string; query: PlacesQuery; report: Awaited<ReturnType<typeof writePlacesPack>> }> {
  const path = join(dir, name);
  const report = await writePlacesPack(await readCandidates(fixture), path, { region: 'GR', locale: 'el', source: 'fixture' });
  const db = new DatabaseSync(path, { readOnly: true });
  const query: PlacesQuery = (sql, params) => Promise.resolve(db.prepare(sql).all(...params) as Record<string, unknown>[]);
  return { path, query, report };
}

describe('places pack builder', () => {
  it('keeps places and emergency POIs, drops everything else', async () => {
    const { report } = await build('a.sqlite');
    // bench, unnamed hamlet and the bus shelter are dropped
    expect(report).toEqual({
      rows: 10,
      skipped: 3,
      byCategory: { settlement: 3, pharmacy: 1, drinking_water: 1, nature: 1, shelter: 1, hospital: 1, fire_station: 1, police: 1 },
    });
  });

  it('is deterministic: the same candidates give the same bytes', async () => {
    const a = await build('det-a.sqlite');
    const b = await build('det-b.sqlite');
    expect(readFileSync(a.path).equals(readFileSync(b.path))).toBe(true);
  });

  it('finds English and local names, with or without accents, offline', async () => {
    const { query } = await build('search.sqlite');
    const names = async (q: string): Promise<string[]> => (await searchPlaces(query, q)).map((p) => placeTitle(p).title);
    expect((await names('Patras'))[0]).toBe('Patras');
    expect((await names('Πάτρα'))[0]).toBe('Patras');
    expect((await names('πατρα'))[0]).toBe('Patras');
    expect((await names('PATR'))[0]).toBe('Patras');
    expect(await names('Mytikas')).toEqual(['Mytikas']);
    expect(await names('Μύτικας')).toEqual(['Mytikas']);
    expect(await names('hospital')).toEqual(['Patras General Hospital']);
    expect(await names('athens')).toEqual(['Athens']);
    expect(await names('"); DROP TABLE places; --')).toEqual([]);
    expect(await names('   ')).toEqual([]);
  });

  it('shows the local name beside the English one', async () => {
    const { query } = await build('title.sqlite');
    const [patras] = await searchPlaces(query, 'Patras', 1);
    expect(patras && placeTitle(patras)).toEqual({ title: 'Patras', local: 'Πάτρα', kind: 'city' });
    const [water] = await emergencyPois(query, { west: 21.7, east: 21.8, south: 38.2, north: 38.3 }, ['drinking_water']);
    expect(water && placeTitle(water)).toEqual({ title: 'Drinking water', local: null, kind: 'drinking water' });
  });

  it('serves the emergency POI layer by category and bounding box', async () => {
    const { query } = await build('pois.sqlite');
    const patras = { west: 21.6, east: 21.85, south: 38.15, north: 38.35 };
    const all = await emergencyPois(query, patras);
    expect(all.map((p) => p.category).sort()).toEqual(['drinking_water', 'fire_station', 'hospital', 'pharmacy', 'police', 'shelter']);
    expect((await emergencyPois(query, patras, ['hospital'])).map((p) => p.kind)).toEqual(['hospital']);
    expect(await emergencyPois(query, { west: 23, east: 24, south: 37, north: 38 })).toEqual([]);
    expect(EMERGENCY_CATEGORIES).toHaveLength(6);
  });

  it('records the ODbL attribution in the pack', async () => {
    const { query } = await build('meta.sqlite');
    expect(await readPlacesMeta(query)).toMatchObject({ schema: '1', region: 'GR', locale: 'el', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors (ODbL 1.0)' });
  });

  it('rejects malformed input', async () => {
    await expect(writePlacesPack([], join(dir, 'bad.sqlite'), { region: 'Greece', locale: 'el', source: 'x' })).rejects.toThrow(/region/);
  });
});
