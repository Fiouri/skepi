import { foldText, tokenize, type EmergencyTopic } from '@skepi/core';
import { CARD_LOCALES, type CardLocale, type EmergencyCard, type LocalizedCard } from './schema';
import { IFRC_GUIDELINES } from './sources';

/** The card functions the apps use, over one list of cards. */
export interface CardsApi {
  cardById: (id: string) => EmergencyCard | null;
  localizeCard: (card: EmergencyCard, locale: CardLocale) => LocalizedCard;
  cardsForTopics: (topics: readonly EmergencyTopic[]) => EmergencyCard[];
  findCards: (text: string) => EmergencyCard[];
  cardsForQuestion: (question: string, topics: readonly EmergencyTopic[]) => EmergencyCard[];
}

function pages(list: readonly number[]): string {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  if (sorted.length === 1) return `p. ${String(sorted[0])}`;
  const contiguous = sorted.every((p, i) => i === 0 || p === (sorted[i - 1] ?? p) + 1);
  return contiguous ? `pp. ${String(sorted[0])}–${String(sorted[sorted.length - 1])}` : `pp. ${sorted.join(', ')}`;
}

/** One line naming the source, edition, section(s) and printed page(s) of a card's steps. */
export function citationLine(card: EmergencyCard): string {
  const sections: string[] = [];
  for (const s of card.steps) if (!sections.includes(s.cite.section)) sections.push(s.cite.section);
  const parts = sections.map((section) => `“${section}”, ${pages(card.steps.filter((s) => s.cite.section === section).map((s) => s.cite.page))}`);
  return `Source: IFRC ${IFRC_GUIDELINES.title} ${IFRC_GUIDELINES.edition}, ${parts.join('; ')}.`;
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
    return all.filter((c) => CARD_LOCALES.some((l) => c.labels[l].keywords.some((k) => keywordMatches(tokens, k))));
  };
  return {
    cardById: (id) => byId.get(id) ?? null,
    localizeCard: (card, locale) => ({
      id: card.id,
      locale,
      title: card.labels[locale].title,
      steps: card.steps,
      citation: citationLine(card),
    }),
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
