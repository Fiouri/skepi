import { open, type DB } from '@op-engineering/op-sqlite';
import {
  countryAt,
  emergencyPois,
  mergePlaces,
  nearestSettlementKm,
  rankPlaces,
  readPlacesMeta,
  searchPlaces,
  type BBox,
  type EmergencyCategory,
  type Place,
  type PlacesMeta,
  type PlacesQuery,
  type RegionCandidate,
  type RegionInfo,
} from '@skepi/core';

/**
 * Places packs (SQLite FTS5 from OpenStreetMap, built by tools/catalog-builder): opened read-only and
 * only when the pack is verified against the signed catalog (useContent().placesPaths). Queries are
 * `@skepi/core` code, the same that the builder tests run against the same schema.
 */
const opened = new Map<string, DB>();

function split(path: string): { location: string; name: string } {
  const i = path.lastIndexOf('/');
  return { location: path.slice(0, i), name: path.slice(i + 1) };
}

function connection(path: string): DB {
  const existing = opened.get(path);
  if (existing) return existing;
  // No encryption key: the pack is a plain SQLite file (public OSM data), opened read-only.
  const db = open({ ...split(path), readOnly: true, failOnCreate: true });
  opened.set(path, db);
  return db;
}

function queryFor(path: string): PlacesQuery {
  return async (sql, params) => {
    const res = await connection(path).execute(sql, [...params]);
    return res.rows;
  };
}

/** Closes packs that are no longer installed or verified. */
export function syncPlacesPacks(paths: readonly string[]): void {
  for (const [path, db] of opened) {
    if (paths.includes(path)) continue;
    db.close();
    opened.delete(path);
  }
}

export interface PlaceHit extends Place {
  packPath: string;
}

/**
 * Searches every verified places pack (one per installed country) and ranks the results together;
 * a place in two packs (border strips) is shown once.
 */
export async function searchAllPlaces(paths: readonly string[], text: string, limit = 8): Promise<PlaceHit[]> {
  const lists: PlaceHit[][] = [];
  for (const path of paths) lists.push((await searchPlaces(queryFor(path), text, limit)).map((h) => ({ ...h, packPath: path })));
  return rankPlaces(text, mergePlaces(lists)).slice(0, limit);
}

/** Emergency POIs of the chosen categories in the visible area, from every verified places pack (once each). */
export async function poisInView(paths: readonly string[], bbox: BBox, categories: readonly EmergencyCategory[]): Promise<Place[]> {
  const lists: Place[][] = [];
  for (const path of paths) lists.push(await emergencyPois(queryFor(path), bbox, categories));
  return mergePlaces(lists);
}

/**
 * The installed country a position is in (emergency numbers follow it): the countries whose box
 * contains it, decided by the nearest settlement of their places packs (core countryAt). The position
 * is used here and dropped: never stored, logged or sent.
 */
export async function countryOfPosition(
  packs: readonly { path: string; kind: 'pmtiles' | 'places'; region: RegionInfo | null }[],
  lat: number,
  lon: number,
): Promise<string | null> {
  const byIso = new Map<string, RegionCandidate & { places: string[] }>();
  for (const p of packs) {
    if (!p.region) continue;
    const c = byIso.get(p.region.iso2) ?? { iso2: p.region.iso2, bbox: p.region.bbox, places: [] };
    if (p.kind === 'places') c.places.push(p.path);
    byIso.set(p.region.iso2, c);
  }
  const candidates: RegionCandidate[] = [];
  for (const c of byIso.values()) {
    if (c.places.length === 0) {
      candidates.push({ iso2: c.iso2, bbox: c.bbox });
      continue;
    }
    let nearest: number | null = null;
    for (const path of c.places) {
      const km = await nearestSettlementKm(queryFor(path), lat, lon);
      if (km !== null && (nearest === null || km < nearest)) nearest = km;
    }
    candidates.push({ iso2: c.iso2, bbox: c.bbox, nearestKm: nearest });
  }
  return countryAt(lat, lon, candidates);
}

export async function placesAttribution(paths: readonly string[]): Promise<string[]> {
  const metas: Partial<PlacesMeta>[] = [];
  for (const path of paths) metas.push(await readPlacesMeta(queryFor(path)));
  return [...new Set(metas.flatMap((m) => (m.attribution ? [m.attribution] : [])))];
}
