import { describe, expect, it } from 'vitest';
import { classifyOsm, placesMatch, placeSearchNames, placeTitle, poisToGeoJson, type Place } from '../src';

describe('classifyOsm', () => {
  it('puts emergency POIs first', () => {
    expect(classifyOsm({ amenity: 'hospital', name: 'X' })).toMatchObject({ category: 'hospital' });
    expect(classifyOsm({ healthcare: 'pharmacy' })).toMatchObject({ category: 'pharmacy' });
    expect(classifyOsm({ amenity: 'fire_station' })).toMatchObject({ category: 'fire_station' });
    expect(classifyOsm({ amenity: 'police' })).toMatchObject({ category: 'police' });
    expect(classifyOsm({ amenity: 'drinking_water' })).toMatchObject({ category: 'drinking_water' });
    expect(classifyOsm({ natural: 'spring', drinking_water: 'yes' })).toMatchObject({ category: 'drinking_water', kind: 'spring' });
    expect(classifyOsm({ emergency: 'assembly_point' })).toMatchObject({ category: 'shelter', kind: 'assembly_point' });
    expect(classifyOsm({ amenity: 'shelter' })).toMatchObject({ category: 'shelter' });
    expect(classifyOsm({ amenity: 'hospital', place: 'village', name: 'Y' })).toMatchObject({ category: 'hospital' });
  });

  it('keeps named settlements and peaks, drops the rest', () => {
    expect(classifyOsm({ place: 'city', name: 'Πάτρα' })).toMatchObject({ category: 'settlement', importance: 100 });
    expect(classifyOsm({ place: 'village' })).toBeNull();
    expect(classifyOsm({ natural: 'peak', name: 'Mytikas' })).toMatchObject({ category: 'nature' });
    expect(classifyOsm({ amenity: 'shelter', shelter_type: 'public_transport' })).toBeNull();
    expect(classifyOsm({ amenity: 'water_point', drinking_water: 'no' })).toBeNull();
    expect(classifyOsm({ amenity: 'bench', name: 'x' })).toBeNull();
  });
});

describe('placesMatch', () => {
  it('folds accents and quotes every token as a prefix', () => {
    expect(placesMatch('Πάτρα')).toBe('"πατρα"*');
    expect(placesMatch('Ag. Nikolaos')).toBe('"ag"* "nikolaos"*');
  });

  it('keeps FTS syntax out of user input', () => {
    expect(placesMatch('a" OR b NEAR(c)')).toBe('"a"* "or"* "b"* "near"* "c"*');
    expect(placesMatch('*:^"')).toBeNull();
    expect(placesMatch('')).toBeNull();
  });
});

describe('placeTitle and search names', () => {
  const base: Pick<Place, 'name' | 'nameEn' | 'nameLocal' | 'kind'> = { name: 'Πάτρα', nameEn: 'Patras', nameLocal: 'Πάτρα', kind: 'city' };

  it('prefers English and shows the local name', () => {
    expect(placeTitle(base)).toEqual({ title: 'Patras', local: 'Πάτρα', kind: 'city' });
    expect(placeTitle({ ...base, nameEn: null })).toEqual({ title: 'Πάτρα', local: null, kind: 'city' });
    expect(placeTitle({ name: 'Rio', nameEn: 'Rio', nameLocal: null, kind: 'suburb' }).local).toBeNull();
    expect(placeTitle({ name: '', nameEn: null, nameLocal: null, kind: 'fire_station' }).title).toBe('Fire station');
  });

  it('de-duplicates folded names', () => {
    expect(placeSearchNames(['Πάτρα', 'Patras', 'ΠΑΤΡΑ', null, ''])).toBe('πατρα | patras');
  });

  it('builds GeoJSON points for the POI layer', () => {
    const p: Place = { id: 7, ...base, category: 'hospital', kind: 'hospital', importance: 45, lat: 38.2, lon: 21.7 };
    expect(poisToGeoJson([p]).features[0]).toEqual({
      type: 'Feature',
      id: 7,
      geometry: { type: 'Point', coordinates: [21.7, 38.2] },
      properties: { category: 'hospital', title: 'Patras' },
    });
  });
});
