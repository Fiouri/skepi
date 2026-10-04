import { describe, expect, it } from 'vitest';
import { el, en, getMessages, resolveLocale, SUPPORTED_LOCALES } from '../src';

type Leaf = string | ((...args: never[]) => string);

function leaves(node: unknown, prefix = ''): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  if (typeof node === 'string' || typeof node === 'function') {
    out.set(prefix, node as Leaf);
    return out;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    for (const [k, v] of leaves(value, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
  }
  return out;
}

const GREEK = /[Ͱ-Ͽ]/u;

describe('resolveLocale', () => {
  it('defaults to English', () => {
    expect(resolveLocale([])).toBe('en');
    expect(resolveLocale([null, undefined, ''])).toBe('en');
    expect(resolveLocale(['en-US'])).toBe('en');
  });

  it('uses Greek for any Greek tag', () => {
    expect(resolveLocale(['el'])).toBe('el');
    expect(resolveLocale(['el-GR'])).toBe('el');
    expect(resolveLocale(['EL_cy'])).toBe('el');
  });

  it('falls back to English for any other language', () => {
    expect(resolveLocale(['de-DE'])).toBe('en');
    expect(resolveLocale(['fr', 'el'])).toBe('en');
    expect(resolveLocale(['ell'])).toBe('en');
  });

  it('follows only the first preferred language', () => {
    expect(resolveLocale(['el-GR', 'en-US'])).toBe('el');
    expect(resolveLocale([null, 'el-GR'])).toBe('el');
  });
});

describe('catalogs', () => {
  const english = leaves(en);
  const greek = leaves(el);

  it('have identical keys and value kinds', () => {
    expect([...greek.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, value] of english) expect(typeof greek.get(key), key).toBe(typeof value);
  });

  it('have no empty strings', () => {
    for (const [key, value] of [...english, ...greek]) {
      if (typeof value === 'string') expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('English has no Greek text', () => {
    for (const [key, value] of english) {
      if (typeof value === 'string') expect(GREEK.test(value), key).toBe(false);
    }
  });

  it('every supported locale has a catalog', () => {
    for (const locale of SUPPORTED_LOCALES) expect(getMessages(locale)).toBeDefined();
    expect(getMessages('el')).toBe(el);
    expect(getMessages('en')).toBe(en);
  });

  it('formats parameters', () => {
    expect(en.article.blockedRequests(0)).toBe('Blocked requests: 0');
    expect(en.article.blockedRequests(null)).toBe('Blocked requests: …');
    expect(en.search.timing({ kind: 'fulltext', count: 1, totalMs: '4.0', nativeMs: '3.1' })).toBe(
      'fulltext: 1 result · 4.0 ms (native 3.1 ms)',
    );
    expect(en.ask.noSourceDetail({ reason: 'below_threshold', coverage: '0.25' })).toBe(
      'Reason: below_threshold · coverage 0.25 · no generation',
    );
    expect(el.ask.noSourceDetail({ reason: 'below_threshold', coverage: '0.25' })).toContain('0.25');
  });
});
