import { emergencyPois, readPlacesMeta, searchPlaces, type BBox, type EmergencyCategory, type Place, type PlacesQuery } from '@skepi/core';
import { ipc } from './ipc';

/**
 * Places packs (SQLite FTS5 from OpenStreetMap): the `@skepi/core` queries run unchanged over a
 * read-only executor; the native side opens only verified places packs (by pack id).
 */
function queryFor(packId: string): PlacesQuery {
  return async (sql, params) => ipc.placesQuery(packId, sql, params);
}

export interface PlaceHit extends Place {
  packId: string;
}

export async function searchAllPlaces(packIds: readonly string[], text: string, limit = 8): Promise<PlaceHit[]> {
  const out: PlaceHit[] = [];
  for (const packId of packIds) {
    const hits = await searchPlaces(queryFor(packId), text, limit);
    out.push(...hits.map((h) => ({ ...h, packId })));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export async function poisInView(packIds: readonly string[], bbox: BBox, categories: readonly EmergencyCategory[]): Promise<Place[]> {
  const out: Place[] = [];
  for (const packId of packIds) out.push(...(await emergencyPois(queryFor(packId), bbox, categories)));
  return out;
}

export async function placesAttribution(packIds: readonly string[]): Promise<string[]> {
  const metas = await Promise.all(packIds.map((id) => readPlacesMeta(queryFor(id))));
  return [...new Set(metas.flatMap((m) => (m.attribution ? [m.attribution] : [])))];
}
