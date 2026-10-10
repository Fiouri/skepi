import { createCardsApi } from './api';
import { bleeding, burns, choking, cpr, fractures, heatstroke, hypothermia, poisoning } from './cards/medical';
import { earthquake, fire, flood, waterPurification } from './cards/disasters';
import {
  ALLOWED_LICENCES,
  CARD_IDS,
  CARD_LOCALES,
  type CardId,
  type EmergencyCard,
} from './schema';
import { ALLOWED_SOURCE_HOSTS, SOURCES } from './sources';

export * from './schema';
export * from './numbers';
export { ALLOWED_SOURCE_HOSTS, SOURCES } from './sources';

/** False: this entry ships the card steps. Developer Preview builds bundle `preview.ts` instead. */
export const PREVIEW_BUILD: boolean = false;

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

const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
const api = createCardsApi(CARDS);
export const { cardById, draftCards, localizeCard, cardsForTopics, findCards, cardsForQuestion } = api;
export { isDraft } from './api';

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
