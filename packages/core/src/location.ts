/**
 * Live position and heading on the map (decision 2026-10-21): pure functions the map screen uses over
 * the GNSS fixes and compass readings of `expo-emergency-tools`. Nothing here stores, logs or sends a
 * position; the app keeps only the latest fix in memory while the map tab is in front.
 */

/** A position from the GNSS receiver (the GPS provider; no Play Services, works offline). */
export interface LocationFix {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius, metres; null when the receiver gives none. */
  accuracyM: number | null;
  /** Ground speed, m/s; null when unknown. */
  speedMps: number | null;
  /** Course over ground, degrees from true north; null when unknown. */
  bearingDeg: number | null;
  /** When the fix was taken (Unix ms). */
  timeMs: number;
}

/** Walking is up to ~1.5 m/s; above this speed the course over ground is a usable direction. */
export const COURSE_MIN_SPEED_MPS = 2.5;
/** A fix older than this is shown as stale (grey puck). */
export const STALE_AFTER_MS = 15_000;
/** In blackout mode fixes come every 15 s: stale only after two missed fixes. */
export const STALE_AFTER_MS_BLACKOUT = 45_000;
/** GNSS update interval while the map is in front, normal and blackout mode. */
export const LOCATION_INTERVAL_MS = 1_000;
export const LOCATION_INTERVAL_MS_BLACKOUT = 15_000;
/** Compass readings at most this often (the native side also drops changes under 1°). */
export const HEADING_INTERVAL_MS = 200;
export const HEADING_INTERVAL_MS_BLACKOUT = 1_000;
/** Share of a new compass reading in the smoothed heading (exponential smoothing on the circle). */
export const HEADING_SMOOTHING = 0.25;

/** Degrees in [0, 360). */
export function normalizeDegrees(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d === 0 ? 0 : d;
}

/** The signed shortest turn from `from` to `to`, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const d = normalizeDegrees(to - from);
  return d > 180 ? d - 360 : d;
}

/**
 * Exponential smoothing of a heading across the 0/360 wrap: moves the previous value toward the new
 * reading along the shorter way round (359° → 1° turns 2°, never 358°). The first reading is taken as is.
 */
export function smoothHeading(previous: number | null, reading: number, alpha: number = HEADING_SMOOTHING): number {
  if (!Number.isFinite(reading)) return previous ?? 0;
  if (previous === null || !Number.isFinite(previous)) return normalizeDegrees(reading);
  const a = Math.min(1, Math.max(0, alpha));
  return normalizeDegrees(previous + a * angleDelta(previous, reading));
}

export type HeadingSource = 'compass' | 'course';

export interface Heading {
  degrees: number;
  source: HeadingSource;
}

/**
 * The direction the cone shows: the smoothed compass while it gives readings that are not
 * "unreliable" (accuracy 0), otherwise the course over ground when moving faster than walking,
 * otherwise none. Declination is not applied (magnetic north; the cone is a direction hint).
 */
export function chooseHeading(compass: { degrees: number; accuracy: number } | null, fix: LocationFix | null): Heading | null {
  if (compass && compass.accuracy > 0 && Number.isFinite(compass.degrees)) return { degrees: normalizeDegrees(compass.degrees), source: 'compass' };
  if (fix && fix.speedMps !== null && fix.speedMps > COURSE_MIN_SPEED_MPS && fix.bearingDeg !== null && Number.isFinite(fix.bearingDeg)) {
    return { degrees: normalizeDegrees(fix.bearingDeg), source: 'course' };
  }
  return null;
}

export type FixState = 'none' | 'stale' | 'live';

/** No fix yet, a fix older than `staleAfterMs`, or a live one. */
export function fixState(fix: LocationFix | null, nowMs: number, staleAfterMs: number = STALE_AFTER_MS): FixState {
  if (!fix) return 'none';
  return nowMs - fix.timeMs > staleAfterMs ? 'stale' : 'live';
}

/**
 * The "My location" button and the camera: `free` (the user moves the map), `centred` (centred once on
 * the position), `follow` (the camera follows every fix). First press centres, the next press toggles
 * follow mode; panning the map always returns to `free`.
 */
export type FollowMode = 'free' | 'centred' | 'follow';

export interface FollowState {
  mode: FollowMode;
  /** The button was pressed before the first fix: centre when it arrives. */
  centreOnFix: boolean;
}

export const INITIAL_FOLLOW: FollowState = { mode: 'free', centreOnFix: false };

export type FollowEvent = { type: 'press'; hasFix: boolean } | { type: 'pan' } | { type: 'fix' };

export interface FollowStep {
  state: FollowState;
  /** Move the camera to the current position now. */
  centre: boolean;
}

export function followStep(state: FollowState, event: FollowEvent): FollowStep {
  switch (event.type) {
    case 'press': {
      const mode: FollowMode = state.mode === 'free' ? 'centred' : state.mode === 'centred' ? 'follow' : 'centred';
      return { state: { mode, centreOnFix: !event.hasFix }, centre: event.hasFix };
    }
    case 'pan':
      return { state: INITIAL_FOLLOW, centre: false };
    case 'fix': {
      const centre = state.centreOnFix || state.mode === 'follow';
      return { state: { ...state, centreOnFix: false }, centre };
    }
  }
}

const EARTH_RADIUS_M = 6_371_008.8;

/** The point `distanceM` metres from (lat, lon) along `bearingDeg` (great circle). Returns [lon, lat]. */
export function destination(latitude: number, longitude: number, distanceM: number, bearingDeg: number): [number, number] {
  const d = distanceM / EARTH_RADIUS_M;
  const b = (bearingDeg * Math.PI) / 180;
  const p1 = (latitude * Math.PI) / 180;
  const l1 = (longitude * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  const lon = ((((l2 * 180) / Math.PI + 540) % 360) + 360) % 360 - 180;
  return [lon, (p2 * 180) / Math.PI];
}

/** A closed ring around (lat, lon) with radius `radiusM`, for the accuracy circle. */
export function circleRing(latitude: number, longitude: number, radiusM: number, steps = 48): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) ring.push(destination(latitude, longitude, radiusM, (360 * i) / steps));
  const first = ring[0];
  if (first) ring.push(first);
  return ring;
}

/** A closed wedge from (lat, lon) toward `headingDeg`, `spreadDeg` wide, `lengthM` long, for the cone. */
export function coneRing(latitude: number, longitude: number, headingDeg: number, lengthM: number, spreadDeg = 50, steps = 8): [number, number][] {
  const apex: [number, number] = [longitude, latitude];
  const ring: [number, number][] = [apex];
  for (let i = 0; i <= steps; i += 1) ring.push(destination(latitude, longitude, lengthM, headingDeg - spreadDeg / 2 + (spreadDeg * i) / steps));
  ring.push(apex);
  return ring;
}

/** Cone length that looks the same at every zoom (~40 px on a phone): metres per pixel × 40. */
export function coneLengthM(latitude: number, zoom: number): number {
  const metresPerPixel = (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return Math.max(5, metresPerPixel * 40);
}

export interface LocationFeatures {
  type: 'FeatureCollection';
  features: (
    | { type: 'Feature'; id: string; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { kind: 'puck'; stale: boolean } }
    | { type: 'Feature'; id: string; geometry: { type: 'Polygon'; coordinates: [number, number][][] }; properties: { kind: 'accuracy' | 'cone'; stale: boolean } }
  )[];
}

/** The GeoJSON the map draws: accuracy circle, heading cone (when known) and the puck. */
export function locationFeatures(fix: LocationFix, heading: Heading | null, state: Exclude<FixState, 'none'>, zoom: number): LocationFeatures {
  const stale = state === 'stale';
  const features: LocationFeatures['features'] = [];
  if (fix.accuracyM !== null && fix.accuracyM > 0) {
    features.push({ type: 'Feature', id: 'accuracy', geometry: { type: 'Polygon', coordinates: [circleRing(fix.latitude, fix.longitude, fix.accuracyM)] }, properties: { kind: 'accuracy', stale } });
  }
  if (heading && !stale) {
    const ring = coneRing(fix.latitude, fix.longitude, heading.degrees, coneLengthM(fix.latitude, zoom));
    features.push({ type: 'Feature', id: 'cone', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { kind: 'cone', stale } });
  }
  features.push({ type: 'Feature', id: 'puck', geometry: { type: 'Point', coordinates: [fix.longitude, fix.latitude] }, properties: { kind: 'puck', stale } });
  return { type: 'FeatureCollection', features };
}
