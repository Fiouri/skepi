// Node only (build gates and tools; never imported by the apps): the digest that ties
// source-check.lock.json to the exact card steps tools/cards-source-check verified.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARDS } from './index';
import type { EmergencyCard } from './schema';
import { IFRC_GUIDELINES } from './sources';

export interface SourceCheckLock {
  source: { url: string; sha256: string; edition: string };
  /** SHA-256 over every card's steps and citations (`cardsDigest`). */
  cardsDigest: string;
  cards: number;
  steps: number;
}

export const SOURCE_CHECK_LOCK = fileURLToPath(new URL('../source-check.lock.json', import.meta.url));

export function cardsDigest(cards: readonly EmergencyCard[] = CARDS): string {
  const canonical = JSON.stringify({
    source: { url: IFRC_GUIDELINES.url, sha256: IFRC_GUIDELINES.sha256, edition: IFRC_GUIDELINES.edition },
    cards: cards.map((c) => ({ id: c.id, steps: c.steps.map((s) => [s.text, s.cite.section, s.cite.page]) })),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function expectedLock(cards: readonly EmergencyCard[] = CARDS): SourceCheckLock {
  return {
    source: { url: IFRC_GUIDELINES.url, sha256: IFRC_GUIDELINES.sha256, edition: IFRC_GUIDELINES.edition },
    cardsDigest: cardsDigest(cards),
    cards: cards.length,
    steps: cards.reduce((n, c) => n + c.steps.length, 0),
  };
}

export function readLock(path: string = SOURCE_CHECK_LOCK): SourceCheckLock | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SourceCheckLock;
  } catch {
    return null;
  }
}

/** Null when the committed lock records a passed source check of exactly these cards; else why not. */
export function lockProblem(cards: readonly EmergencyCard[] = CARDS, path: string = SOURCE_CHECK_LOCK): string | null {
  const lock = readLock(path);
  if (lock === null) return `no source-check lock at ${path}`;
  const expected = expectedLock(cards);
  if (lock.source.sha256 !== expected.source.sha256 || lock.source.url !== expected.source.url) return 'the lock was written for another source PDF';
  if (lock.cardsDigest !== expected.cardsDigest) return 'the card steps differ from the last passed cards-source-check';
  return null;
}
