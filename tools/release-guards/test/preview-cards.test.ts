import { describe, expect, it } from 'vitest';
import { adviceTexts, findAdvice, probeOf } from '../src/preview-cards';

describe('preview cards check', () => {
  const texts = adviceTexts();

  it('has a searchable probe for every advice text', () => {
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.filter((t) => probeOf(t) === null)).toEqual([]);
  });

  it('finds advice text in UTF-8 (JavaScript) and UTF-16LE (Hermes strings), also next to escapes', () => {
    const english = texts[0] ?? '';
    const greek = texts.find((t) => /\p{Script=Greek}/u.test(t)) ?? '';
    const js = Buffer.from(`var a="${english.replace(/"/g, '\\"')}";`, 'utf8');
    const hermes = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(greek, 'utf16le'), Buffer.from([9, 9])]);
    expect(findAdvice(new Uint8Array(js), texts)).toContain(english);
    expect(findAdvice(new Uint8Array(hermes), texts)).toContain(greek);
  });

  it('passes a bundle without advice text', () => {
    const bundle = Buffer.from('var cards=[{id:"cpr",title:"CPR: unresponsive and not breathing (adult)",steps:[]}];', 'utf8');
    expect(findAdvice(new Uint8Array(bundle), texts)).toEqual([]);
  });
});
