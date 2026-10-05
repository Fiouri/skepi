/** Coordinate formats for the Tools tab and the SMS hand-off (no network, no map service). */

/** Decimal degrees with 5 decimals (~1 m), as shown and sent by SMS. */
export function formatDecimal(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function dms(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60 * 10) / 10;
  if (sec >= 60) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    deg += 1;
  }
  return `${String(deg)}°${String(min).padStart(2, '0')}′${sec.toFixed(1).padStart(4, '0')}″${hemisphere}`;
}

/** Degrees, minutes, seconds: 37°58′31.5″N 23°43′41.7″E. */
export function formatDms(latitude: number, longitude: number): string {
  return `${dms(latitude, 'N', 'S')} ${dms(longitude, 'E', 'W')}`;
}

const POINTS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Compass point of a heading (8 points). */
export function compassPoint(heading: number): (typeof POINTS_EN)[number] {
  const index = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
  return POINTS_EN[index] ?? 'N';
}

/** An OpenStreetMap link the recipient can open (the app itself never opens it). */
export function osmLink(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}
