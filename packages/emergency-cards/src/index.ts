import { foldText, tokenize, type EmergencyTopic } from '@skepi/core';
import { bleeding, burns, choking, cpr, fractures, heatstroke, hypothermia, poisoning } from './cards/medical';
import { earthquake, fire, flood, waterPurification } from './cards/disasters';
import {
  ALLOWED_LICENCES,
  CARD_IDS,
  CARD_LOCALES,
  type CardId,
  type CardLocale,
  type CardStepSpec,
  type EmergencyCard,
  type LocalizedCard,
} from './schema';
import { ALLOWED_SOURCE_HOSTS, SOURCES } from './sources';

export * from './schema';
export * from './numbers';
export { ALLOWED_SOURCE_HOSTS, SOURCES } from './sources';

/** Every bundled card, in the order the Tools tab lists them. */
export const CARDS: readonly EmergencyCard[] = [
  cpr,
  bleeding,
  choking,
  burns,
  fractures,
  hypothermia,
  heatstroke,
  poisoning,
  waterPurification,
  earthquake,
  fire,
  flood,
];

const BY_ID = new Map<string, EmergencyCard>(CARDS.map((c) => [c.id, c]));
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

export function cardById(id: string): EmergencyCard | null {
  return BY_ID.get(id) ?? null;
}

export function isDraft(card: EmergencyCard): boolean {
  return card.review.status !== 'reviewed';
}

export function draftCards(cards: readonly EmergencyCard[] = CARDS): EmergencyCard[] {
  return cards.filter(isDraft);
}

function resolveRefs(spec: CardStepSpec): LocalizedCard['whenToCallForHelp']['refs'] {
  return spec.refs.map((r) => {
    const s = SOURCE_BY_ID.get(r.source);
    return { ...r, title: s?.title ?? r.source, url: s?.url ?? '' };
  });
}

export function localizeCard(card: EmergencyCard, locale: CardLocale): LocalizedCard {
  const text = card.locales[locale];
  return {
    id: card.id,
    locale,
    title: text.title,
    steps: card.steps.map((spec, i) => ({ text: text.steps[i] ?? '', refs: resolveRefs(spec) })),
    whenToCallForHelp: { text: text.whenToCallForHelp, refs: resolveRefs(card.whenToCallForHelp) },
    draft: isDraft(card),
    review: card.review,
  };
}

/** Cards for the emergency intercept topics, in card order. */
export function cardsForTopics(topics: readonly EmergencyTopic[]): EmergencyCard[] {
  return CARDS.filter((c) => c.topics.some((t) => topics.includes(t)));
}

/**
 * Short words match exactly or as an English plural ("fire" must not match "firearm"); longer words
 * also match inflected forms (Greek endings, "-ing") that differ by at most a few letters.
 */
function tokenMatches(token: string, word: string): boolean {
  if (word.length < 5) return token === word || token === `${word}s` || token === `${word}es`;
  if (token.startsWith(word)) return token.length - word.length <= 4;
  return token.length >= 5 && word.startsWith(token) && word.length - token.length <= 2;
}

function keywordMatches(tokens: readonly string[], keyword: string): boolean {
  const parts = tokenize(foldText(keyword));
  if (parts.length === 0) return false;
  for (let start = 0; start + parts.length <= tokens.length; start += 1) {
    const ok = parts.every((p, k) => {
      const t = tokens[start + k];
      return t !== undefined && tokenMatches(t, p);
    });
    if (ok) return true;
  }
  return false;
}

/** Cards whose keywords (in any language) appear in the text: home search and the Ask intercept. */
export function findCards(text: string): EmergencyCard[] {
  const tokens = tokenize(foldText(text));
  if (tokens.length === 0) return [];
  return CARDS.filter((c) => CARD_LOCALES.some((l) => c.locales[l].keywords.some((k) => keywordMatches(tokens, k))));
}

/** Cards to show first for a question: intercept topics, then keyword matches, without duplicates. */
export function cardsForQuestion(question: string, topics: readonly EmergencyTopic[]): EmergencyCard[] {
  const out = cardsForTopics(topics);
  for (const c of findCards(question)) if (!out.includes(c)) out.push(c);
  return out;
}

export interface CardProblem {
  card: string;
  problem: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Structural checks every bundled card must pass (unit tests and the release check). */
export function validateCards(cards: readonly EmergencyCard[] = CARDS): CardProblem[] {
  const problems: CardProblem[] = [];
  const add = (card: string, problem: string): void => {
    problems.push({ card, problem });
  };
  for (const s of SOURCES) {
    if (!ALLOWED_LICENCES.includes(s.licence)) add(s.id, `source licence not allowed: ${s.licence}`);
    let host = '';
    try {
      const url = new URL(s.url);
      if (url.protocol !== 'https:') add(s.id, 'source URL must be https');
      host = url.hostname;
    } catch {
      add(s.id, `invalid source URL ${s.url}`);
    }
    if (!ALLOWED_SOURCE_HOSTS.some((re) => re.test(host))) add(s.id, `source host not allowed: ${host}`);
    if (!DATE.test(s.accessed)) add(s.id, 'accessed must be YYYY-MM-DD');
  }
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) add(card.id, 'duplicate id');
    ids.add(card.id);
    if (card.steps.length === 0) add(card.id, 'no steps');
    for (const [i, spec] of [...card.steps, card.whenToCallForHelp].entries()) {
      if (spec.refs.length === 0) add(card.id, `step ${String(i + 1)} has no source`);
      for (const r of spec.refs) {
        if (!SOURCE_BY_ID.has(r.source)) add(card.id, `step ${String(i + 1)} cites unknown source ${r.source}`);
        if (r.locator.trim().length === 0) add(card.id, `step ${String(i + 1)} has no locator`);
      }
    }
    for (const locale of CARD_LOCALES) {
      const text = card.locales[locale];
      if (text.title.trim().length === 0) add(card.id, `${locale}: empty title`);
      if (text.steps.length !== card.steps.length) {
        add(card.id, `${locale}: ${String(text.steps.length)} steps, master has ${String(card.steps.length)}`);
      }
      if (text.steps.some((s) => s.trim().length === 0)) add(card.id, `${locale}: empty step`);
      if (text.whenToCallForHelp.trim().length === 0) add(card.id, `${locale}: empty "when to call for help"`);
      if (text.keywords.length === 0) add(card.id, `${locale}: no keywords`);
    }
    const r = card.review;
    if (r.status === 'reviewed') {
      if (r.reviewers.length < 2) add(card.id, 'a reviewed card needs at least 2 reviewers (architecture: certified first-aid instructors)');
      if (r.date === null || !DATE.test(r.date)) add(card.id, 'a reviewed card needs a review date');
    } else if (r.date !== null && !DATE.test(r.date)) {
      add(card.id, 'review date must be YYYY-MM-DD');
    }
  }
  for (const id of CARD_IDS) if (!cards.some((c) => c.id === id)) add(id, 'missing card');
  return problems;
}

export type { CardId };
