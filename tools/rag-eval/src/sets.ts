import type { Lang } from '@skepi/core';
import { readFile } from 'node:fs/promises';

/**
 * - answer: the expected articles contain the answer; shown AI sentences should cite them.
 * - no_source: nothing on the device answers it; no AI sentence may be shown.
 * - any: adversarial items where showing nothing and showing a correct answer are both fine; only
 *   unsupported sentences, forbidden content and number/unit violations count.
 */
export type Expectation = 'answer' | 'no_source' | 'any';

export type ItemKind = 'factual' | 'medical' | 'unrelated' | 'absent-number' | 'bait' | 'injection';

export interface EvalItem {
  id: string;
  lang: Lang;
  question: string;
  expect: Expectation;
  kind: ItemKind;
  /** Acceptable source article titles (any one of them); empty for no_source. */
  articles: string[];
  /** Case/accent-insensitive substrings that must never appear in a shown sentence. */
  forbidden?: string[];
  /** Term groups that must never appear together in one shown sentence (stitched facts). */
  forbiddenTogether?: string[][];
  note?: string;
}

export interface EvalSet {
  name: string;
  description: string;
  items: EvalItem[];
}

const EXPECTATIONS: readonly Expectation[] = ['answer', 'no_source', 'any'];
const KINDS: readonly ItemKind[] = ['factual', 'medical', 'unrelated', 'absent-number', 'bait', 'injection'];

function fail(set: string, id: string, msg: string): never {
  throw new Error(`${set}: item ${id}: ${msg}`);
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null;
}

function parseItem(set: string, raw: unknown): EvalItem {
  if (typeof raw !== 'object' || raw === null) fail(set, '?', 'not an object');
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : fail(set, '?', 'missing id');
  const lang = r.lang === 'en' || r.lang === 'el' ? r.lang : fail(set, id, 'lang must be en or el');
  const expect = EXPECTATIONS.find((e) => e === r.expect) ?? fail(set, id, 'bad expect');
  const kind = KINDS.find((k) => k === r.kind) ?? fail(set, id, 'bad kind');
  const question = typeof r.question === 'string' && r.question.trim().length > 0 ? r.question : fail(set, id, 'empty question');
  const articles = strings(r.articles) ?? fail(set, id, 'articles must be a string array');
  if (expect === 'answer' && articles.length === 0) fail(set, id, 'answer item without articles');
  if (expect === 'no_source' && articles.length > 0) fail(set, id, 'no_source item with articles');
  const item: EvalItem = { id, lang, question, expect, kind, articles };
  if (r.forbidden !== undefined) item.forbidden = strings(r.forbidden) ?? fail(set, id, 'forbidden must be a string array');
  if (r.forbiddenTogether !== undefined) {
    const groups = Array.isArray(r.forbiddenTogether) ? r.forbiddenTogether.map(strings) : null;
    if (!groups || groups.some((g) => g === null)) fail(set, id, 'forbiddenTogether must be string arrays');
    item.forbiddenTogether = groups as string[][];
  }
  if (typeof r.note === 'string') item.note = r.note;
  return item;
}

/** Loads and validates a golden set; a malformed item is an error, never skipped. */
export async function loadSet(path: string): Promise<EvalSet> {
  const data = JSON.parse(await readFile(path, 'utf8')) as { name?: unknown; description?: unknown; items?: unknown };
  const name = typeof data.name === 'string' ? data.name : path;
  if (!Array.isArray(data.items)) throw new Error(`${name}: items must be an array`);
  const items = data.items.map((raw) => parseItem(name, raw));
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) fail(name, item.id, 'duplicate id');
    ids.add(item.id);
  }
  return { name, description: typeof data.description === 'string' ? data.description : '', items };
}

/** Article titles compare case-insensitively, with underscores as spaces (ZIM paths vs titles). */
export function sameArticle(a: string, b: string): boolean {
  const n = (s: string): string => s.replace(/_/g, ' ').trim().toLocaleLowerCase();
  return n(a) === n(b);
}
