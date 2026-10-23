import { COUNTRY_NUMBERS, type CountryNumbers } from '@skepi/emergency-cards';
import { describe, expect, it } from 'vitest';
import { checkedSources, checkNumbers, formatNumberSnapshot, numberSnapshots, parseNumberSnapshot, pdfLines, quoteShows } from '../src/numbers';

const SNAP = '# Emergency numbers\nPolice: dial 110.\nFire and ambulance: call 119 when you need an ambulance service\n';

function entry(services: CountryNumbers['services'], quotes: { text: string; numbers: string[] }[]): CountryNumbers {
  return {
    country: 'XX',
    name: { en: 'Testland', el: 'Testland' },
    general: '119',
    services,
    sources: [
      {
        title: 'Testland emergency numbers',
        url: 'https://example.org/numbers',
        accessed: '2026-10-23',
        check: { id: 'xx', format: 'html', fileSha256: 'a'.repeat(64), textSha256: 'b'.repeat(64), quotes },
      },
    ],
  };
}

describe('emergency numbers source check', () => {
  it('every committed snapshot matches its pins and every number is shown by a verbatim quote', () => {
    const problems: string[] = [];
    const snaps = numberSnapshots(problems);
    expect(problems).toEqual([]);
    expect(snaps.size).toBe(checkedSources().length);
    expect(checkNumbers(snaps).filter((r) => !r.ok)).toEqual([]);
    expect(checkNumbers(snaps)).toHaveLength(COUNTRY_NUMBERS.length);
  });

  it('passes when quotes are verbatim (whitespace normalised) and show every number', () => {
    const c = entry({ police: '110', ambulance: '119' }, [
      { text: 'Police: dial 110.', numbers: ['110'] },
      { text: 'call 119 when  you need an ambulance service', numbers: ['119'] },
    ]);
    expect(checkNumbers(new Map([['xx', SNAP]]), [c], [])).toEqual([{ country: 'XX', ok: true, problems: [] }]);
  });

  it('fails on an altered quote, a quote not showing its number, an unshown number or a missing snapshot', () => {
    const altered = entry({}, [{ text: 'call 119 when you need a fire engine', numbers: ['119'] }]);
    expect(checkNumbers(new Map([['xx', SNAP]]), [altered], [])[0]?.problems).toEqual(['xx: quote not in the source: "call 119 when you need a fire engine"']);
    const wrongNumber = entry({}, [{ text: 'Police: dial 110.', numbers: ['119'] }]);
    expect(checkNumbers(new Map([['xx', SNAP]]), [wrongNumber], [])[0]?.problems).toEqual([
      'xx: the quote does not show 119: "Police: dial 110."',
      '119 is not shown by a quote of a checked source',
    ]);
    const unshown = entry({ police: '110' }, [{ text: 'call 119 when you need an ambulance service', numbers: ['119'] }]);
    expect(checkNumbers(new Map([['xx', SNAP]]), [unshown], [])[0]?.problems).toEqual(['110 is not shown by a quote of a checked source']);
    expect(checkNumbers(new Map(), [unshown], [])[0]?.problems[0]).toBe('xx: no snapshot');
  });

  it('a country without a checked source only when listed as unchecked', () => {
    const plain: CountryNumbers = { country: 'YY', name: { en: 'Y', el: 'Y' }, general: '112', services: {}, sources: [{ title: 't', url: 'https://example.org', accessed: '2026-10-05' }] };
    expect(checkNumbers(new Map(), [plain], [])[0]?.ok).toBe(false);
    expect(checkNumbers(new Map(), [plain], ['YY'])[0]?.ok).toBe(true);
    const checked = entry({}, [{ text: 'call 119 when you need an ambulance service', numbers: ['119'] }]);
    expect(checkNumbers(new Map([['xx', SNAP]]), [checked], ['XX'])[0]?.problems).toEqual(['listed in UNCHECKED_NUMBER_COUNTRIES but has a checked source']);
  });

  it('quoteShows: digits as written; a North American number without its leading 1', () => {
    expect(quoteShows('210 7793 777: Κέντρο Δηλητηριάσεων', '2107793777')).toBe(true);
    expect(quoteShows('Call the Poison Control Center at (800) 222-1222', '18002221222')).toBe(true);
    expect(quoteShows('Call 9-1-1 or your fire department.', '911')).toBe(true);
    expect(quoteShows('Call 9-1-1 or your fire department.', '112')).toBe(false);
  });

  it('snapshot format round trip; PDF text one trimmed line per line', () => {
    const snap = { url: 'https://example.org/a.pdf', retrieved: '2026-10-23', format: 'pdf' as const, fileSha256: 'c'.repeat(64), text: 'a\nb\n' };
    expect(parseNumberSnapshot(formatNumberSnapshot(snap))).toEqual(snap);
    expect(pdfLines('  Guide \fPlease  call 119\n\n\u200b\n')).toBe('Guide\nPlease call 119\n');
  });
});
