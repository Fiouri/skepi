import type { EmergencyTopic } from '@skepi/core';

/**
 * Emergency cards (docs/architecture.md, "User safety"; decision 2026-10-21): every step is a verbatim
 * excerpt from the IFRC International First Aid, Resuscitation and Education Guidelines, with its
 * citation (edition, section, page). No paraphrase, no excerpts merged into new sentences, no
 * LLM-written text. tools/cards-source-check proves every step is an exact substring of the source at
 * the cited page. A topic with no IFRC passage stays unsourced and is never shipped (src/unsourced.ts).
 * Cards never pass through the LLM.
 */

export const CARD_LOCALES = ['en', 'el'] as const;
export type CardLocale = (typeof CARD_LOCALES)[number];

/**
 * The language cards are shown in. The steps are English IFRC text; the Greek titles and search
 * keywords stay for the frozen Greek locale (after v1), the steps are never translated.
 */
export const CARD_DISPLAY_LOCALE: CardLocale = 'en';

export const CARD_IDS = ['cpr', 'bleeding', 'choking', 'burns', 'fractures', 'hypothermia', 'heatstroke', 'poisoning'] as const;
export type CardId = (typeof CARD_IDS)[number];

/** The published source document of every card step. */
export interface CardSource {
  title: string;
  edition: string;
  publisher: string;
  /** Pinned download URL of the PDF (tools/cards-source-check). */
  url: string;
  /** SHA-256 of the PDF at `url`. */
  sha256: string;
  /** The licence statement printed in the source, verbatim. */
  licence: string;
  /** Date the URL and hash were pinned (YYYY-MM-DD). */
  accessed: string;
}

/** Where in the source a step comes from: the topic (section) and the printed page number. */
export interface Citation {
  section: string;
  page: number;
}

export interface CardStep {
  /** Verbatim excerpt (one or more whole sentences) from the source, at `cite.page`. */
  text: string;
  cite: Citation;
}

/** Title and search words per language (UI text, not advice). */
export interface CardLabels {
  title: string;
  /** Folded-or-plain search words (home search and the Ask intercept); matched as token prefixes. */
  keywords: readonly string[];
}

export interface EmergencyCard {
  id: CardId;
  /** Emergency intercept topics (packages/core `detectEmergency`) that show this card. */
  topics: readonly EmergencyTopic[];
  /** Numbered steps, in the order shown. */
  steps: readonly CardStep[];
  labels: Readonly<Record<CardLocale, CardLabels>>;
}

/** A card resolved for one language (what the UI renders). */
export interface LocalizedCard {
  id: CardId;
  locale: CardLocale;
  title: string;
  steps: readonly CardStep[];
  /** "Source: <title> (<edition>), "<section>", p. <page>; …" */
  citation: string;
}
