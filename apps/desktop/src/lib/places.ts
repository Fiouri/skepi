import { emergencyPois, mergePlaces, rankPlaces, readPlacesMeta, searchPlaces, type BBox, type EmergencyCategory, type Place, type PlacesQuery } from '@skepi/core';
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

/** Every installed country's places pack, ranked together; a place in two packs (border strips) once. */
export async function searchAllPlaces(packIds: readonly string[], text: string, limit = 8): Promise<PlaceHit[]> {
  const lists = await Promise.all(packIds.map(async (packId) => (await searchPlaces(queryFor(packId), text, limit)).map((h) => ({ ...h, packId }))));
  return rankPlaces(text, mergePlaces(lists)).slice(0, limit);
}

export async function poisInView(packIds: readonly string[], bbox: BBox, categories: readonly EmergencyCategory[]): Promise<Place[]> {
  return mergePlaces(await Promise.all(packIds.map((packId) => emergencyPois(queryFor(packId), bbox, categories))));
}

export async function placesAttribution(packIds: readonly string[]): Promise<string[]> {
  const metas = await Promise.all(packIds.map((id) => readPlacesMeta(queryFor(id))));
  return [...new Set(metas.flatMap((m) => (m.attribution ? [m.attribution] : [])))];
}
