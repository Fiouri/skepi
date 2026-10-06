import { open, type DB } from '@op-engineering/op-sqlite';
import {
  emergencyPois,
  readPlacesMeta,
  searchPlaces,
  type BBox,
  type EmergencyCategory,
  type Place,
  type PlacesMeta,
  type PlacesQuery,
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

/** Searches every verified places pack; packs are queried in order and results kept per pack. */
export async function searchAllPlaces(paths: readonly string[], text: string, limit = 8): Promise<PlaceHit[]> {
  const out: PlaceHit[] = [];
  for (const path of paths) {
    const hits = await searchPlaces(queryFor(path), text, limit);
    out.push(...hits.map((h) => ({ ...h, packPath: path })));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Emergency POIs of the chosen categories in the visible area, from every verified places pack. */
export async function poisInView(paths: readonly string[], bbox: BBox, categories: readonly EmergencyCategory[]): Promise<Place[]> {
  const out: Place[] = [];
  for (const path of paths) out.push(...(await emergencyPois(queryFor(path), bbox, categories)));
  return out;
}

export async function placesAttribution(paths: readonly string[]): Promise<string[]> {
  const metas: Partial<PlacesMeta>[] = [];
  for (const path of paths) metas.push(await readPlacesMeta(queryFor(path)));
  return [...new Set(metas.flatMap((m) => (m.attribution ? [m.attribution] : [])))];
}
