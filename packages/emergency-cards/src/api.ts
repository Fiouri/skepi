import { foldText, tokenize, type EmergencyTopic } from '@skepi/core';
import { CARD_LOCALES, type CardLocale, type CardStepSpec, type EmergencyCard, type LocalizedCard } from './schema';
import { SOURCES } from './sources';

/**
 * The card functions the apps use, over one list of cards: the full cards (`index.ts`) or the
 * Developer Preview cards without any step text (`preview.ts`, chosen by the bundler).
 */
export interface CardsApi {
  cardById: (id: string) => EmergencyCard | null;
  draftCards: (cards?: readonly EmergencyCard[]) => EmergencyCard[];
  localizeCard: (card: EmergencyCard, locale: CardLocale) => LocalizedCard;
  cardsForTopics: (topics: readonly EmergencyTopic[]) => EmergencyCard[];
  findCards: (text: string) => EmergencyCard[];
  cardsForQuestion: (question: string, topics: readonly EmergencyTopic[]) => EmergencyCard[];
}

export function isDraft(card: EmergencyCard): boolean {
  return card.review.status !== 'reviewed';
}

const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

function resolveRefs(spec: CardStepSpec): LocalizedCard['whenToCallForHelp']['refs'] {
  return spec.refs.map((r) => {
    const s = SOURCE_BY_ID.get(r.source);
    return { ...r, title: s?.title ?? r.source, url: s?.url ?? '' };
  });
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

export function createCardsApi(all: readonly EmergencyCard[]): CardsApi {
  const byId = new Map<string, EmergencyCard>(all.map((c) => [c.id, c]));
  const cardsForTopics = (topics: readonly EmergencyTopic[]): EmergencyCard[] => all.filter((c) => c.topics.some((t) => topics.includes(t)));
  const findCards = (text: string): EmergencyCard[] => {
    const tokens = tokenize(foldText(text));
    if (tokens.length === 0) return [];
    return all.filter((c) => CARD_LOCALES.some((l) => c.locales[l].keywords.some((k) => keywordMatches(tokens, k))));
  };
  return {
    cardById: (id) => byId.get(id) ?? null,
    draftCards: (cards = all) => cards.filter(isDraft),
    localizeCard: (card, locale) => {
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
    },
    cardsForTopics,
    findCards,
    /** Cards to show first for a question: intercept topics, then keyword matches, without duplicates. */
    cardsForQuestion: (question, topics) => {
      const out = cardsForTopics(topics);
      for (const c of findCards(question)) if (!out.includes(c)) out.push(c);
      return out;
    },
  };
}
