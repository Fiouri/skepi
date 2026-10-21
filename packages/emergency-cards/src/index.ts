import { createCardsApi } from './api';
import { bleeding, burns, choking, cpr, earthquake, fire, flood, fractures, heatstroke, hypothermia, poisoning, waterPurification } from './cards';
import { CARD_IDS, CARD_LOCALES, type CardId, type CardSource, type EmergencyCard } from './schema';
import { SOURCES } from './sources';

export * from './schema';
export * from './numbers';
export { CDC_DISCLAIMER, FEMA_DISCLAIMER, IFRC_ATTRIBUTION, IFRC_GUIDELINES, SOURCES, WEB_SOURCES } from './sources';
export { citationLine, disclaimerOf } from './api';

/** False: a full build. Developer Preview builds bundle `preview.ts` (same cards, preview label on). */
export const PREVIEW_BUILD: boolean = false;

/** Every bundled card (all sourced), in the order the Tools tab lists them. */
export const CARDS: readonly EmergencyCard[] = [
  cpr,
  bleeding,
  choking,
  burns,
  fractures,
  hypothermia,
  heatstroke,
  poisoning,
  fire,
  earthquake,
  flood,
  waterPurification,
];

const api = createCardsApi(CARDS);
export const { cardById, localizeCard, cardsForTopics, findCards, cardsForQuestion } = api;

export interface CardProblem {
  card: string;
  problem: string;
}

/**
 * Structural checks every bundled card must pass (unit tests and the release gate): every step carries
 * a citation (a known source, a section, and a printed page for PDF sources only) and is a plain excerpt
 * (no source step number, no line break). That the text is verbatim at the cited place is proved by
 * tools/cards-source-check.
 */
export function validateCards(cards: readonly EmergencyCard[] = CARDS): CardProblem[] {
  const problems: CardProblem[] = [];
  const add = (card: string, problem: string): void => {
    problems.push({ card, problem });
  };
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) add(card.id, 'duplicate id');
    ids.add(card.id);
    if (card.steps.length === 0) add(card.id, 'no steps');
    for (const [i, s] of card.steps.entries()) {
      const n = `step ${String(i + 1)}`;
      if (s.text.trim().length === 0) add(card.id, `${n}: empty text`);
      if (s.text !== s.text.trim() || /\s{2,}|[\n\r\t]/.test(s.text)) add(card.id, `${n}: whitespace must be single spaces`);
      if (/^\d+\.\s/.test(s.text)) add(card.id, `${n}: starts with a source step number`);
      if (s.cite.section.trim().length === 0) add(card.id, `${n}: no cited section`);
      const source = (SOURCES as Partial<Record<string, CardSource>>)[s.cite.source];
      if (!source) add(card.id, `${n}: unknown source ${s.cite.source}`);
      else if (source.kind === 'pdf' && (s.cite.page === null || !Number.isInteger(s.cite.page) || s.cite.page < 1)) {
        add(card.id, `${n}: invalid cited page ${String(s.cite.page)}`);
      } else if (source.kind === 'html' && s.cite.page !== null) add(card.id, `${n}: a web source has no page`);
    }
    for (const locale of CARD_LOCALES) {
      const labels = card.labels[locale];
      if (labels.title.trim().length === 0) add(card.id, `${locale}: empty title`);
      if (labels.keywords.length === 0) add(card.id, `${locale}: no keywords`);
    }
  }
  for (const id of CARD_IDS) if (!cards.some((c) => c.id === id)) add(id, 'missing card');
  return problems;
}

export type { CardId };
