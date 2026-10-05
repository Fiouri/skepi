import { describe, expect, it } from 'vitest';
import { COUNTRY_NUMBERS, countryList, DEFAULT_EMERGENCY_NUMBER, formatNumber, numbersFor } from '../src';

describe('emergency numbers', () => {
  it('Greece: 112, EKAB 166, fire 199, police 100', () => {
    const gr = numbersFor('GR');
    expect(gr).toMatchObject({ country: 'GR', general: '112', known: true });
    expect(gr.services).toMatchObject({ ambulance: '166', fire: '199', police: '100' });
  });

  it('defaults to 112 for an unknown or missing country, marked as not known', () => {
    expect(DEFAULT_EMERGENCY_NUMBER).toBe('112');
    expect(numbersFor('ZZ')).toMatchObject({ general: '112', known: false, country: 'ZZ' });
    expect(numbersFor(null)).toMatchObject({ general: '112', known: false, country: null });
  });

  it('documents a source for every country', () => {
    for (const c of COUNTRY_NUMBERS) {
      expect(c.sources.length, c.country).toBeGreaterThan(0);
      for (const s of c.sources) {
        expect(new URL(s.url).protocol).toBe('https:');
        expect(s.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(c.general).toMatch(/^\d{3}$/);
      for (const n of Object.values(c.services)) expect(n).toMatch(/^\d{3,11}$/);
    }
  });

  it('has unique ISO codes and covers every EU member state', () => {
    const codes = COUNTRY_NUMBERS.map((c) => c.country);
    expect(new Set(codes).size).toBe(codes.length);
    const eu = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
    for (const code of eu) expect(numbersFor(code)).toMatchObject({ general: '112', known: true });
  });

  it('lists countries sorted in the UI language', () => {
    const el = countryList('el');
    expect(el[0]?.name.localeCompare(el[1]?.name ?? '', 'el')).toBeLessThan(0);
    expect(countryList('en').find((c) => c.country === 'GR')?.name).toBe('Greece');
  });

  it('formats long numbers for reading', () => {
    expect(formatNumber('2107793777')).toBe('210 779 3777');
    expect(formatNumber('18002221222')).toBe('1-800-222-1222');
    expect(formatNumber('112')).toBe('112');
  });
});
