// Node only (build gates and tools; never imported by the apps): the digests that tie
// source-check.lock.json to the exact card steps and emergency numbers tools/cards-source-check verified.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARDS } from './index';
import { COUNTRY_NUMBERS, type CountryNumbers } from './numbers';
import type { CardSource, EmergencyCard } from './schema';
import { SOURCES } from './sources';

/** What pins a source: the PDF's URL and hash, or the web page's URL, retrieval date and hashes. */
export interface LockedSource {
  id: string;
  url: string;
  /** PDF: SHA-256 of the file. Web page: SHA-256 of the committed snapshot text. */
  sha256: string;
  /** PDF: the edition. Web page: the retrieval date of the snapshot. */
  version: string;
}

export interface SourceCheckLock {
  sources: LockedSource[];
  /** SHA-256 over every card's steps and citations and the pinned sources (`cardsDigest`). */
  cardsDigest: string;
  cards: number;
  steps: number;
  /** SHA-256 over every country's numbers, sources, quotes and pins (`numbersDigest`). */
  numbersDigest: string;
  countries: number;
}

export const SOURCE_CHECK_LOCK = fileURLToPath(new URL('../source-check.lock.json', import.meta.url));

function locked(source: CardSource): LockedSource {
  return source.kind === 'pdf'
    ? { id: source.id, url: source.url, sha256: source.sha256, version: source.edition }
    : { id: source.id, url: source.url, sha256: source.textSha256, version: source.accessed };
}

/** The sources the cards cite, in the order of their first citation. */
export function lockedSources(cards: readonly EmergencyCard[] = CARDS): LockedSource[] {
  const ids: string[] = [];
  for (const c of cards) for (const s of c.steps) if (!ids.includes(s.cite.source)) ids.push(s.cite.source);
  return ids.map((id) => locked(SOURCES[id as keyof typeof SOURCES]));
}

export function cardsDigest(cards: readonly EmergencyCard[] = CARDS): string {
  const canonical = JSON.stringify({
    sources: lockedSources(cards),
    cards: cards.map((c) => ({ id: c.id, steps: c.steps.map((s) => [s.text, s.cite.source, s.cite.section, s.cite.page]) })),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function numbersDigest(countries: readonly CountryNumbers[] = COUNTRY_NUMBERS): string {
  return createHash('sha256').update(JSON.stringify(countries), 'utf8').digest('hex');
}

export function expectedLock(cards: readonly EmergencyCard[] = CARDS, countries: readonly CountryNumbers[] = COUNTRY_NUMBERS): SourceCheckLock {
  return {
    sources: lockedSources(cards),
    cardsDigest: cardsDigest(cards),
    cards: cards.length,
    steps: cards.reduce((n, c) => n + c.steps.length, 0),
    numbersDigest: numbersDigest(countries),
    countries: countries.length,
  };
}

export function readLock(path: string = SOURCE_CHECK_LOCK): SourceCheckLock | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SourceCheckLock;
  } catch {
    return null;
  }
}

/** Null when the committed lock records a passed source check of exactly these cards and numbers; else why not. */
export function lockProblem(
  cards: readonly EmergencyCard[] = CARDS,
  path: string = SOURCE_CHECK_LOCK,
  countries: readonly CountryNumbers[] = COUNTRY_NUMBERS,
): string | null {
  const lock = readLock(path);
  if (lock === null) return `no source-check lock at ${path}`;
  const expected = expectedLock(cards, countries);
  if (JSON.stringify(lock.sources) !== JSON.stringify(expected.sources)) return 'the lock was written for other sources';
  if (lock.cardsDigest !== expected.cardsDigest) return 'the card steps differ from the last passed cards-source-check';
  if (lock.numbersDigest !== expected.numbersDigest) return 'the emergency numbers differ from the last passed cards-source-check';
  return null;
}
