import { foldText } from './text';

/**
 * Places packs (docs/architecture.md, "Offline maps"): one SQLite file per region, built by
 * tools/catalog-builder from an OpenStreetMap extract (ODbL), with an FTS5 index over every name of a
 * place (name, name:en, name:<locale>) and an English kind word. The same file feeds the emergency POI
 * layer of the map. This module owns the schema, the OSM classification (used by the builder) and the
 * queries (used by the app), so both sides agree on one definition.
 */
export const PLACES_SCHEMA = 1;

export const EMERGENCY_CATEGORIES = ['hospital', 'pharmacy', 'fire_station', 'police', 'drinking_water', 'shelter'] as const;
export type EmergencyCategory = (typeof EMERGENCY_CATEGORIES)[number];
export type PlaceCategory = 'settlement' | 'nature' | EmergencyCategory;

/** English kind words, indexed for search ("pharmacy") and shown when a POI has no name. */
export const KIND_LABELS: Readonly<Record<string, string>> = {
  city: 'city',
  town: 'town',
  village: 'village',
  hamlet: 'hamlet',
  suburb: 'suburb',
  quarter: 'quarter',
  neighbourhood: 'neighbourhood',
  locality: 'locality',
  island: 'island',
  islet: 'islet',
  hospital: 'hospital',
  pharmacy: 'pharmacy',
  fire_station: 'fire station',
  police: 'police',
  drinking_water: 'drinking water',
  water_point: 'water point',
  spring: 'spring',
  shelter: 'shelter',
  assembly_point: 'emergency assembly point',
  alpine_hut: 'mountain hut',
  wilderness_hut: 'wilderness hut',
  peak: 'peak',
};

export interface OsmClass {
  category: PlaceCategory;
  /** Kind key of KIND_LABELS. */
  kind: string;
  /** Search ranking weight (bigger places first). */
  importance: number;
}

const SETTLEMENTS: Readonly<Record<string, number>> = {
  city: 100,
  town: 80,
  island: 70,
  village: 60,
  suburb: 50,
  quarter: 40,
  hamlet: 30,
  neighbourhood: 25,
  islet: 20,
  locality: 15,
};

type Tags = Readonly<Record<string, string | undefined>>;

/**
 * The place category of an OSM object, or null when it is not part of a places pack. Emergency POIs
 * come first: a hospital is a hospital even when it also carries other tags.
 */
export function classifyOsm(tags: Tags): OsmClass | null {
  const amenity = tags.amenity;
  const healthcare = tags.healthcare;
  if (amenity === 'hospital' || healthcare === 'hospital') return { category: 'hospital', kind: 'hospital', importance: 45 };
  if (amenity === 'pharmacy' || healthcare === 'pharmacy') return { category: 'pharmacy', kind: 'pharmacy', importance: 20 };
  if (amenity === 'fire_station') return { category: 'fire_station', kind: 'fire_station', importance: 25 };
  if (amenity === 'police') return { category: 'police', kind: 'police', importance: 25 };
  if (amenity === 'drinking_water') return { category: 'drinking_water', kind: 'drinking_water', importance: 10 };
  if (amenity === 'water_point' && tags.drinking_water !== 'no') return { category: 'drinking_water', kind: 'water_point', importance: 10 };
  if (tags.natural === 'spring' && tags.drinking_water === 'yes') return { category: 'drinking_water', kind: 'spring', importance: 10 };
  if (tags.emergency === 'assembly_point') return { category: 'shelter', kind: 'assembly_point', importance: 15 };
  if (amenity === 'shelter' && tags.shelter_type !== 'public_transport') return { category: 'shelter', kind: 'shelter', importance: 10 };
  if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return { category: 'shelter', kind: tags.tourism, importance: 15 };
  const place = tags.place;
  if (place !== undefined) {
    const importance = SETTLEMENTS[place];
    if (importance !== undefined && hasName(tags)) return { category: 'settlement', kind: place, importance };
  }
  if (tags.natural === 'peak' && hasName(tags)) return { category: 'nature', kind: 'peak', importance: 20 };
  if (tags.natural === 'spring' && hasName(tags)) return { category: 'nature', kind: 'spring', importance: 10 };
  return null;
}

function hasName(tags: Tags): boolean {
  return Boolean(tags.name?.trim() || tags['name:en']?.trim());
}

/** One row of a places pack. */
export interface Place {
  id: number;
  /** OSM `name` (the local name, e.g. Greek in Greece); empty for an unnamed POI. */
  name: string;
  nameEn: string | null;
  /** `name:<locale>` of the pack's region (e.g. name:el). */
  nameLocal: string | null;
  category: PlaceCategory;
  kind: string;
  importance: number;
  lat: number;
  lon: number;
}

/** Shown in English with the local name beside it (architecture: names in English with local names). */
export function placeTitle(p: Pick<Place, 'name' | 'nameEn' | 'nameLocal' | 'kind'>): { title: string; local: string | null; kind: string } {
  const kind = KIND_LABELS[p.kind] ?? p.kind;
  const local = p.nameLocal?.trim() || p.name.trim() || null;
  const english = p.nameEn?.trim() || null;
  if (english) return { title: english, local: local && foldText(local) !== foldText(english) ? local : null, kind };
  if (local) return { title: local, local: null, kind };
  return { title: kind.charAt(0).toUpperCase() + kind.slice(1), local: null, kind };
}

/** Folded, de-duplicated search text over every name (FTS column `names`). */
export function placeSearchNames(names: readonly (string | null | undefined)[]): string {
  const seen = new Set<string>();
  for (const n of names) {
    const f = n ? foldText(n).replace(/\s+/g, ' ').trim() : '';
    if (f) seen.add(f);
  }
  return [...seen].join(' | ');
}

/** SQL of a places pack (the builder writes it; tests use it to make fixtures). */
export const PLACES_DDL = [
  'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    osm_type TEXT NOT NULL CHECK (osm_type IN ('n','w','r')),
    osm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    name_local TEXT,
    category TEXT NOT NULL,
    kind TEXT NOT NULL,
    importance INTEGER NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL
  )`,
  'CREATE INDEX places_category_lat ON places (category, lat)',
  "CREATE VIRTUAL TABLE places_fts USING fts5(names, kind, content='', tokenize='unicode61 remove_diacritics 2')",
] as const;

/** Keys of the `meta` table. */
export interface PlacesMeta {
  schema: string;
  region: string;
  locale: string;
  source: string;
  license: string;
  attribution: string;
}

export const PLACES_ATTRIBUTION = '© OpenStreetMap contributors (ODbL 1.0)';

export type PlacesQuery = (sql: string, params: readonly (string | number)[]) => Promise<Record<string, unknown>[]>;

const TOKEN = /[\p{L}\p{N}]+/gu;
const MAX_TOKENS = 6;

/**
 * FTS5 MATCH expression for what the user typed: folded tokens, each as a quoted prefix, all
 * required. Null when nothing searchable is left. Quotes keep FTS5 syntax out of user input.
 */
export function placesMatch(text: string): string | null {
  const tokens = (foldText(text).match(TOKEN) ?? []).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}

function rowToPlace(r: Record<string, unknown>): Place {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    id: Number(r.id),
    name: typeof r.name === 'string' ? r.name : '',
    nameEn: str(r.name_en),
    nameLocal: str(r.name_local),
    category: String(r.category) as PlaceCategory,
    kind: String(r.kind),
    importance: Number(r.importance),
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}

const SELECT = 'p.id, p.name, p.name_en, p.name_local, p.category, p.kind, p.importance, p.lat, p.lon';
/** FTS candidates read before re-ranking (exact names first, then importance). */
const CANDIDATES = 200;

/**
 * Searches a places pack. Ranking: a folded name equal to the query, then names that start with it,
 * then importance (city > town > village > POI), then FTS rank. Deterministic for a given pack.
 */
export async function searchPlaces(query: PlacesQuery, text: string, limit = 20): Promise<Place[]> {
  const match = placesMatch(text);
  if (match === null) return [];
  const rows = await query(
    `SELECT ${SELECT}, bm25(places_fts) AS score FROM places_fts JOIN places p ON p.id = places_fts.rowid ` +
      'WHERE places_fts MATCH ? ORDER BY bm25(places_fts), p.id LIMIT ?',
    [match, CANDIDATES],
  );
  const q = foldText(text).replace(/\s+/g, ' ').trim();
  const rank = (p: Place): number => {
    const names = [p.name, p.nameEn, p.nameLocal].flatMap((n) => (n ? [foldText(n)] : []));
    if (names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    return 2;
  };
  return rows
    .map((r, i) => ({ p: rowToPlace(r), i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || b.p.importance - a.p.importance || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Emergency POIs of the given categories inside a bounding box (the map's filterable layer). */
export async function emergencyPois(
  query: PlacesQuery,
  bbox: BBox,
  categories: readonly EmergencyCategory[] = EMERGENCY_CATEGORIES,
  limit = 1500,
): Promise<Place[]> {
  const wanted = categories.filter((c) => (EMERGENCY_CATEGORIES as readonly string[]).includes(c));
  if (wanted.length === 0) return [];
  const rows = await query(
    `SELECT ${SELECT} FROM places p WHERE p.category IN (${wanted.map(() => '?').join(', ')}) ` +
      'AND p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ? ORDER BY p.importance DESC, p.id LIMIT ?',
    [...wanted, bbox.south, bbox.north, bbox.west, bbox.east, limit],
  );
  return rows.map(rowToPlace);
}

/** Reads the `meta` table (attribution, region, licence) of a places pack. */
export async function readPlacesMeta(query: PlacesQuery): Promise<Partial<PlacesMeta>> {
  const rows = await query('SELECT key, value FROM meta', []);
  const out: Record<string, string> = {};
  for (const r of rows) if (typeof r.key === 'string' && typeof r.value === 'string') out[r.key] = r.value;
  return out;
}

/** GeoJSON for the POI layer (MapLibre source). */
export function poisToGeoJson(pois: readonly Place[]): {
  type: 'FeatureCollection';
  features: { type: 'Feature'; id: number; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { category: string; title: string } }[];
} {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { category: p.category, title: placeTitle(p).title },
    })),
  };
}
