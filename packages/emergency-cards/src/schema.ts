import type { EmergencyTopic } from '@skepi/core';

/**
 * Emergency cards (docs/architecture.md, "User safety"; decisions 2026-10-21): every step is a verbatim
 * excerpt of a cited source: the IFRC International First Aid, Resuscitation and Education Guidelines
 * (section, page) for first aid, US federal public-domain pages (CDC, FEMA Ready.gov; section, URL,
 * retrieval date) for water and disasters. No paraphrase, no excerpts merged into new sentences, no
 * LLM-written text, no quote edited to localise it. tools/cards-source-check proves every step is an
 * exact substring of its source (the IFRC PDF page, or the committed snapshot of the web page). A topic
 * with no suitable passage stays unsourced and is never shipped (src/unsourced.ts). Cards never pass
 * through the LLM.
 */

export const CARD_LOCALES = ['en', 'el'] as const;
export type CardLocale = (typeof CARD_LOCALES)[number];

/**
 * The language cards are shown in. The steps are English source text; the Greek titles and search
 * keywords stay for the frozen Greek locale (after v1), the steps are never translated.
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
  'fire',
  'earthquake',
  'flood',
  'water-purification',
] as const;
export type CardId = (typeof CARD_IDS)[number];

export const SOURCE_IDS = ['ifrc-2025', 'cdc-water', 'ready-earthquakes', 'ready-home-fires', 'ready-wildfires', 'ready-floods'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** A PDF source, never committed: tools/cards-source-check downloads it from `url` and checks `sha256`. */
export interface PdfSource {
  kind: 'pdf';
  id: SourceId;
  title: string;
  edition: string;
  publisher: string;
  /** Pinned download URL of the PDF. */
  url: string;
  /** SHA-256 of the PDF at `url`. */
  sha256: string;
  /** The licence statement printed in the source, verbatim. */
  licence: string;
  /** Date the URL and hash were pinned (YYYY-MM-DD). */
  accessed: string;
}

/**
 * A public-domain web page (US federal government work). Its text is committed as a dated snapshot
 * (tools/cards-source-check/snapshots/<id>.txt) that the source check compares the steps with; a weekly
 * CI job re-fetches the page and reports drift.
 */
export interface WebSource {
  kind: 'html';
  id: SourceId;
  /** The page title, as printed on the page. */
  title: string;
  publisher: string;
  /** The attribution the publisher asks for, shown on every card from this source ("Source: CDC"). */
  attribution: string;
  url: string;
  /** Retrieval date of the snapshot (YYYY-MM-DD). */
  accessed: string;
  /** SHA-256 of the fetched HTML (recorded in the snapshot header). */
  htmlSha256: string;
  /** SHA-256 of the snapshot text (the committed snapshot body, UTF-8). */
  textSha256: string;
  /** The publisher's reuse terms page. */
  termsUrl: string;
  /** The no-endorsement statement the reuse terms require, shown prominently on every card from it. */
  disclaimer: string;
}

export type CardSource = PdfSource | WebSource;

/**
 * Where in the source a step comes from: the source, the topic (PDF) or heading (web page) it sits
 * under, and the printed page number (PDF sources; null for web pages).
 */
export interface Citation {
  source: SourceId;
  section: string;
  page: number | null;
}

export interface CardStep {
  /** Verbatim excerpt (one or more whole sentences) from the source, at `cite`. */
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
  /** "Source: IFRC <title> <edition>, "<section>", p. <page>; …" or "Source: CDC. "<title>", <url>, retrieved <date>." */
  citation: string;
  /** The publisher's no-endorsement statement for web sources (shown prominently); null for IFRC cards. */
  disclaimer: string | null;
}
