import { describe, expect, it } from 'vitest';
import { compassPoint, formatDecimal, formatDms, osmLink } from '../src/geo';

describe('geo formats', () => {
  it('formats decimal degrees with 5 decimals', () => {
    expect(formatDecimal(38.246639, 21.734573)).toBe('38.24664, 21.73457');
    expect(formatDecimal(-33.8688, 151.2093)).toBe('-33.86880, 151.20930');
  });

  it('formats degrees, minutes, seconds with hemispheres', () => {
    expect(formatDms(37.97541, 23.72825)).toBe('37°58′31.5″N 23°43′41.7″E');
    expect(formatDms(-33.8688, -70.6693)).toBe('33°52′07.7″S 70°40′09.5″W');
    // Rounding up to a full minute carries over.
    expect(formatDms(10.9999999, 0)).toBe('11°00′00.0″N 0°00′00.0″E');
  });

  it('names the compass point', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(44)).toBe('NE');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(-90)).toBe('W');
  });

  it('builds an OpenStreetMap link for the recipient', () => {
    expect(osmLink(38.24664, 21.73457)).toBe('https://www.openstreetmap.org/?mlat=38.24664&mlon=21.73457#map=16/38.24664/21.73457');
  });
});
