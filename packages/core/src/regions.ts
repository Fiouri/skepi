import type { BBoxTuple, CatalogPack, PackKind, RegionPart } from './catalog';
import { foldText } from './text';

/**
 * Global maps (decision 2026-10-23, docs/architecture.md "Offline maps"): the user picks a country,
 * downloads its map pack(s) and places pack, and uses every installed country at once. This module
 * turns the signed catalog into the country list of Packs → "Maps & places" and answers which country
 * a position is in (for the emergency number), with no geometry beyond the catalog's bounding boxes.
 */

export interface RegionInfo {
  iso2: string;
  name: string;
  /** Null for a schema 1 pack outside LEGACY_REGIONS. */
  bbox: BBoxTuple | null;
  center: [number, number] | null;
  part: RegionPart | null;
}

/** Box and centre of the regions that schema 1 catalogs carry only as a `region:XX` tag. */
export const LEGACY_REGIONS: Readonly<Record<string, { bbox: BBoxTuple; center: [number, number] }>> = {
  // catalog/regions/gr.geojson (Natural Earth v5.1.2 + buffer); centre: Patras, where the map opened before.
  GR: { bbox: [19.5766, 34.7666, 28.2898, 41.7996], center: [21.7346, 38.2466] },
};

const LEGACY_TITLE = /^(?:Map|Places)[^:]*:\s*([^(]+?)\s*(?:\(.*)?$/;

/**
 * The region of a map or places pack: its schema 2 `region`, or for schema 1 packs (map-gr and
 * places-gr of catalogs up to sequence 3) the `region:XX` tag with the name from the title.
 */
export function packRegion(pack: Pick<CatalogPack, 'kind' | 'tags' | 'title' | 'region'>): RegionInfo | null {
  if (pack.kind !== 'pmtiles' && pack.kind !== 'places') return null;
  if (pack.region) {
    const r = pack.region;
    return { iso2: r.iso2, name: r.name, bbox: r.bbox, center: r.center, part: r.part ?? null };
  }
  const tag = pack.tags.find((t) => /^region:[A-Z]{2}$/.test(t));
  if (!tag) return null;
  const iso2 = tag.slice('region:'.length);
  const name = pack.title.en.match(LEGACY_TITLE)?.[1] ?? iso2;
  const legacy = LEGACY_REGIONS[iso2];
  return { iso2, name, bbox: legacy?.bbox ?? null, center: legacy?.center ?? null, part: null };
}

/** What the app knows about an installed pack (structural subset of InstalledPack / PackRow). */
export interface InstalledLike {
  id: string;
  kind: PackKind;
  version: string;
  sha256: string;
  verified: boolean;
}

/** What the country list needs of a catalog pack (the desktop's IPC form of a pack fits too). */
export type RegionPackLike = Pick<CatalogPack, 'id' | 'kind' | 'tags' | 'title' | 'region' | 'sizeBytes' | 'sha256'>;

export interface CountryPack<P extends RegionPackLike = CatalogPack> {
  pack: P;
  installed: InstalledLike | null;
  /** Installed, but the catalog has other bytes for this pack id (a newer build). */
  update: boolean;
}

export type CountryStatus = 'available' | 'partial' | 'installed' | 'update';

export interface CountryEntry<P extends RegionPackLike = CatalogPack> {
  iso2: string;
  name: string;
  bbox: BBoxTuple | null;
  center: [number, number] | null;
  /** Map packs: one, or the parts of a split country (by part name). */
  maps: CountryPack<P>[];
  places: CountryPack<P> | null;
  /** Every pack of the country. */
  sizeBytes: number;
  /** Packs not installed yet plus updates: what "Download" or "Update" fetches. */
  missingBytes: number;
  status: CountryStatus;
}

function countryPack<P extends RegionPackLike>(pack: P, installed: ReadonlyMap<string, InstalledLike>): CountryPack<P> {
  const have = installed.get(pack.id) ?? null;
  return { pack, installed: have, update: have !== null && have.verified && have.sha256 !== pack.sha256 };
}

function partName(p: RegionPackLike): string {
  return p.region?.part?.name ?? '';
}

/** Countries of the catalog, sorted by name, with what is installed and what can be updated. */
export function listCountries<P extends RegionPackLike>(catalog: { packs: readonly P[] } | null, installed: readonly InstalledLike[]): CountryEntry<P>[] {
  if (!catalog) return [];
  const have = new Map(installed.filter((p) => p.kind === 'pmtiles' || p.kind === 'places').map((p) => [p.id, p]));
  const byIso = new Map<string, { name: string; bbox: BBoxTuple | null; center: [number, number] | null; maps: CountryPack<P>[]; places: CountryPack<P> | null }>();
  for (const pack of catalog.packs) {
    const region = packRegion(pack);
    if (!region) continue;
    const entry = byIso.get(region.iso2) ?? { name: region.name, bbox: region.bbox, center: region.center, maps: [], places: null };
    const cp = countryPack(pack, have);
    if (pack.kind === 'pmtiles') entry.maps.push(cp);
    else entry.places ??= cp;
    byIso.set(region.iso2, entry);
  }
  const out: CountryEntry<P>[] = [];
  for (const [iso2, e] of byIso) {
    const maps = [...e.maps].sort((a, b) => partName(a.pack).localeCompare(partName(b.pack), 'en') || a.pack.id.localeCompare(b.pack.id));
    const all = [...maps, ...(e.places ? [e.places] : [])];
    const installedCount = all.filter((p) => p.installed !== null).length;
    const missing = all.filter((p) => p.installed === null || p.update);
    const status: CountryStatus =
      installedCount === 0 ? 'available' : all.some((p) => p.update) ? 'update' : installedCount === all.length ? 'installed' : 'partial';
    out.push({
      iso2,
      name: e.name,
      bbox: e.bbox,
      center: e.center,
      maps,
      places: e.places,
      sizeBytes: all.reduce((n, p) => n + p.pack.sizeBytes, 0),
      missingBytes: missing.reduce((n, p) => n + p.pack.sizeBytes, 0),
      status,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.iso2.localeCompare(b.iso2));
}

function folded(query: string): string {
  return foldText(query).replace(/\s+/g, ' ').trim();
}

/** The search name of a part that matches the folded query (its group names first), or null. */
function partTerm(part: RegionPart | null | undefined, q: string): string | null {
  if (!part || q.length === 0) return null;
  if (foldText(part.name).includes(q)) return part.name;
  return part.regions.find((r) => foldText(r).includes(q)) ?? null;
}

/**
 * The country list filtered by what the user typed: name (accents and case folded), ISO code, or a
 * subdivision of a split country's part ("Bayern" finds Germany).
 */
export function filterCountries<E extends { iso2: string; name: string; maps?: readonly { pack: Pick<RegionPackLike, 'region'> }[] }>(list: readonly E[], query: string): E[] {
  const q = folded(query);
  if (q.length === 0) return [...list];
  return list.filter((c) => foldText(c.name).includes(q) || c.iso2.toLowerCase() === q || (c.maps ?? []).some((m) => partTerm(m.pack.region?.part, q) !== null));
}

/**
 * The parts of a split country that the query found by a subdivision rather than by the country
 * (pack id → the matching name, shown beside the part): empty when the query names the country.
 */
export function matchingParts(entry: CountryEntry<RegionPackLike>, query: string): Map<string, string> {
  const q = folded(query);
  const out = new Map<string, string>();
  if (q.length === 0 || entry.maps.length < 2 || foldText(entry.name).includes(q) || entry.iso2.toLowerCase() === q) return out;
  for (const m of entry.maps) {
    const term = partTerm(m.pack.region?.part, q);
    if (term !== null) out.set(m.pack.id, term);
  }
  return out;
}

/**
 * Packs a "Download" / "Update" of a country fetches: every map part (or only `parts`, by part id),
 * and the places pack; installed packs with the catalog's bytes are skipped.
 */
export function countryDownloads<P extends RegionPackLike>(entry: CountryEntry<P>, parts?: readonly string[]): P[] {
  const maps = entry.maps.filter((m) => !parts || parts.includes(m.pack.region?.part?.id ?? ''));
  return [...maps, ...(entry.places ? [entry.places] : [])].filter((p) => p.installed === null || p.update).map((p) => p.pack);
}

/** Installed pack ids of a country (what "Delete" removes). */
export function countryInstalledIds(entry: CountryEntry<RegionPackLike>): string[] {
  return [...entry.maps, ...(entry.places ? [entry.places] : [])].flatMap((p) => (p.installed ? [p.installed.id] : []));
}

/**
 * What "Delete part" removes: the part's map, and the country's places pack when no other map part of
 * the country stays installed (places and emergency points serve every installed part).
 */
export function partRemovalIds(entry: CountryEntry<RegionPackLike>, mapPackId: string): string[] {
  const part = entry.maps.find((m) => m.pack.id === mapPackId);
  if (!part?.installed) return [];
  const othersLeft = entry.maps.some((m) => m.pack.id !== mapPackId && m.installed !== null);
  return [part.installed.id, ...(!othersLeft && entry.places?.installed ? [entry.places.installed.id] : [])];
}

/**
 * The region of each installed, verified map or places pack, by pack id (from the catalog; a pack the
 * catalog no longer lists has no region and still renders, without a country).
 */
export function installedRegions(catalog: { packs: readonly RegionPackLike[] } | null, installed: readonly InstalledLike[]): Map<string, RegionInfo> {
  const out = new Map<string, RegionInfo>();
  if (!catalog) return out;
  const byId = new Map(catalog.packs.map((p) => [p.id, p]));
  for (const p of installed) {
    if (!p.verified || (p.kind !== 'pmtiles' && p.kind !== 'places')) continue;
    const entry = byId.get(p.id);
    const region = entry ? packRegion(entry) : null;
    if (region) out.set(p.id, region);
  }
  return out;
}

/** Inside the box; a box with west > east wraps across the antimeridian. */
export function bboxContains(bbox: BBoxTuple, lat: number, lon: number): boolean {
  if (lat < bbox[1] || lat > bbox[3]) return false;
  return bbox[0] <= bbox[2] ? lon >= bbox[0] && lon <= bbox[2] : lon >= bbox[0] || lon <= bbox[2];
}

function bboxArea(b: BBoxTuple): number {
  const width = b[0] <= b[2] ? b[2] - b[0] : b[2] + 360 - b[0];
  return width * (b[3] - b[1]);
}

/** A settlement farther than this does not place a position in that country. */
export const NEAREST_SETTLEMENT_MAX_KM = 50;

export interface RegionCandidate {
  iso2: string;
  bbox: BBoxTuple | null;
  /**
   * Distance to the nearest settlement of the country's places pack: a number, null when the pack has
   * none nearby, undefined when the country has no places pack installed.
   */
  nearestKm?: number | null;
}

/** Installed countries whose bounding box contains the position (one per country), smallest box first. */
export function regionsContaining<T extends { iso2: string; bbox: BBoxTuple | null }>(regions: readonly T[], lat: number, lon: number): (T & { bbox: BBoxTuple })[] {
  const seen = new Set<string>();
  const out: (T & { bbox: BBoxTuple })[] = [];
  for (const r of regions) {
    const bbox = r.bbox;
    if (!bbox || seen.has(r.iso2) || !bboxContains(bbox, lat, lon)) continue;
    seen.add(r.iso2);
    out.push({ ...r, bbox });
  }
  return out.sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox) || a.iso2.localeCompare(b.iso2));
}

/**
 * The country of a position among the installed ones (for the emergency number). Boxes are only a
 * first filter (they overlap: neighbours, overseas territories, the United States' box spans the
 * Pacific): among the countries whose box contains the position, the one with the nearest settlement
 * within NEAREST_SETTLEMENT_MAX_KM in its places pack; without a places pack, the smallest box. Null
 * when no installed country fits (the app then uses the chosen country).
 */
export function countryAt(lat: number, lon: number, candidates: readonly RegionCandidate[]): string | null {
  const inside = regionsContaining(candidates, lat, lon);
  const near = inside.flatMap((c) =>
    typeof c.nearestKm === 'number' && Number.isFinite(c.nearestKm) && c.nearestKm <= NEAREST_SETTLEMENT_MAX_KM ? [{ ...c, km: c.nearestKm }] : [],
  );
  if (near.length > 0) return near.sort((a, b) => a.km - b.km || bboxArea(a.bbox) - bboxArea(b.bbox) || a.iso2.localeCompare(b.iso2))[0]?.iso2 ?? null;
  return inside.find((c) => c.nearestKm === undefined)?.iso2 ?? null;
}

/** Great-circle distance in km (haversine, mean Earth radius). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Zoom at which a country's box roughly fills a phone screen (3–10; the box may cross the antimeridian). */
export function fitZoom(bbox: BBoxTuple): number {
  const width = bbox[0] <= bbox[2] ? bbox[2] - bbox[0] : bbox[2] + 360 - bbox[0];
  const span = Math.max(width, (bbox[3] - bbox[1]) * 1.5, 0.01);
  return Math.min(10, Math.max(3, Math.floor(Math.log2(360 / span))));
}

/** Where the map opened before global maps (Patras, the test region of the Greece packs). */
export const LEGACY_HOME: { center: [number, number]; zoom: number } = { center: [21.7346, 38.2466], zoom: 12 };

/** The box around boxes that do not cross the antimeridian (null when one does, or for none). */
function unionBBox(boxes: readonly BBoxTuple[]): BBoxTuple | null {
  if (boxes.length === 0 || boxes.some((b) => b[0] > b[2])) return null;
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

/**
 * Where the map opens without a place to show: the chosen country (or the first installed one),
 * whole, or only its installed parts when the installed maps are parts (Bavaria alone opens on
 * Bavaria); Greece from a schema 1 catalog on Patras at zoom 12 as before. `regions`: the regions of
 * the installed map packs.
 */
export function mapHome(regions: readonly RegionInfo[], country: string | null): { center: [number, number]; zoom: number } {
  const own = regions.find((r) => r.iso2 === country) ?? regions[0] ?? null;
  if (!own?.center) return LEGACY_HOME;
  if (own.center === LEGACY_REGIONS[own.iso2]?.center) return { center: own.center, zoom: LEGACY_HOME.zoom };
  const mine = regions.filter((r) => r.iso2 === own.iso2);
  const parts = mine.every((r) => r.part !== null) ? unionBBox(mine.flatMap((r) => (r.part ? [r.part.bbox] : []))) : null;
  if (parts) return { center: [(parts[0] + parts[2]) / 2, (parts[1] + parts[3]) / 2], zoom: fitZoom(parts) };
  return { center: own.center, zoom: own.bbox ? fitZoom(own.bbox) : 6 };
}
