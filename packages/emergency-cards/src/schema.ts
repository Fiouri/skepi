import type { EmergencyTopic } from '@skepi/core';

/**
 * Emergency cards (docs/architecture.md, "User safety"): static, sourced, human-reviewed first-aid and
 * disaster instructions. They never pass through the LLM. English is the master; every translation
 * has exactly the same steps in the same order, so a step's sources apply to every language.
 */

export const CARD_LOCALES = ['en', 'el'] as const;
export type CardLocale = (typeof CARD_LOCALES)[number];

/**
 * The language cards are shown in: English only until the cards are reviewed (translations come after
 * v1). The Greek translation stays in the data and its tests, but is never displayed.
 */
export const CARD_DISPLAY_LOCALE: CardLocale = 'en';

export const CARD_IDS = [
  'cpr',
  'bleeding',
  'choking',
  'burns',
  'fractures',
  'hypothermia',
  'heatstroke',
  'poisoning',
  'water-purification',
  'earthquake',
  'fire',
  'flood',
] as const;
export type CardId = (typeof CARD_IDS)[number];

/** Only public-domain material: works of the US federal government (17 U.S.C. § 105). */
export const PUBLIC_DOMAIN_US = 'Public domain (work of the U.S. federal government, 17 U.S.C. § 105)';
export const ALLOWED_LICENCES: readonly string[] = [PUBLIC_DOMAIN_US];

export interface CardSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  licence: string;
  /** Date the text was checked against the source (YYYY-MM-DD). */
  accessed: string;
}

/** Where in a source a step comes from: section, paragraph or page. */
export interface SourceRef {
  source: string;
  locator: string;
}

export interface CardStepSpec {
  refs: readonly SourceRef[];
}

export interface CardText {
  title: string;
  /** Numbered steps, same count and order as `EmergencyCard.steps`. */
  steps: readonly string[];
  whenToCallForHelp: string;
  /** Folded-or-plain search words (home search and the Ask intercept); matched as token prefixes. */
  keywords: readonly string[];
}

export interface Reviewer {
  name: string;
  /** e.g. "First-aid instructor (Hellenic Red Cross), cert. no. …". */
  qualification: string;
}

export type ReviewStatus = 'draft' | 'reviewed';

export interface CardReview {
  status: ReviewStatus;
  reviewers: readonly Reviewer[];
  /** Date of the last review (YYYY-MM-DD); null while draft. */
  date: string | null;
}

export interface EmergencyCard {
  id: CardId;
  /** Emergency intercept topics (packages/core `detectEmergency`) that show this card. */
  topics: readonly EmergencyTopic[];
  steps: readonly CardStepSpec[];
  whenToCallForHelp: CardStepSpec;
  locales: Readonly<Record<CardLocale, CardText>>;
  review: CardReview;
}

/** A card resolved for one language, with its sources (what the UI renders). */
export interface LocalizedCard {
  id: CardId;
  locale: CardLocale;
  title: string;
  steps: { text: string; refs: (SourceRef & { title: string; url: string })[] }[];
  whenToCallForHelp: { text: string; refs: (SourceRef & { title: string; url: string })[] };
  draft: boolean;
  review: CardReview;
}
