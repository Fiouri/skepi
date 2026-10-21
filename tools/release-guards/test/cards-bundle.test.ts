import { describe, expect, it } from 'vitest';
import { findTexts, patternsOf, probeOf, sourcedTexts, unsourcedTexts } from '../src/cards-bundle';

describe('cards bundle check', () => {
  const unsourced = unsourcedTexts();
  const sourced = sourcedTexts();

  it('has the 202 unsourced texts and a searchable probe for every text', () => {
    expect(unsourced).toHaveLength(202);
    expect(sourced.length).toBeGreaterThan(50);
    expect(unsourced.filter((t) => probeOf(t) === null)).toEqual([]);
    // Shorter than 16 characters: too common to search for; the other steps of the card prove it ships.
    expect(sourced.filter((t) => probeOf(t) === null)).toEqual(['Access EMS.']);
  });

  it('no sourced step equals or contains an unsourced text (the two lists cannot be confused)', () => {
    for (const s of sourced) for (const u of unsourced) expect(s.includes(u)).toBe(false);
  });

  it('finds text in UTF-8, in UTF-16LE (Hermes strings) and as \\u escapes (esbuild), also next to escapes', () => {
    const english = unsourced[0] ?? '';
    const greek = unsourced.find((t) => /\p{Script=Greek}/u.test(t)) ?? '';
    const curly = sourced.find((t) => t.includes('’')) ?? '';
    const js = Buffer.from(`var a="${english.replace(/"/g, '\\"')}";`, 'utf8');
    const hermes = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(greek, 'utf16le'), Buffer.from([9, 9])]);
    const asEsbuild = (t: string): string => t.replace(/[^ -~]/gu, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    const esbuild = Buffer.from(`var b="${asEsbuild(curly)}";`, 'latin1');
    expect(findTexts([new Uint8Array(js)], unsourced)).toContain(english);
    expect(findTexts([new Uint8Array(hermes)], unsourced)).toContain(greek);
    expect(findTexts([new Uint8Array(esbuild)], sourced)).toContain(curly);
    expect(patternsOf(curly)).toHaveLength(4);
  });

  it('passes a bundle without card text', () => {
    const bundle = Buffer.from('var cards=[{id:"cpr",title:"CPR: unresponsive and not breathing normally (adult)",steps:[]}];', 'utf8');
    expect(findTexts([new Uint8Array(bundle)], [...unsourced, ...sourced])).toEqual([]);
  });
});
