/**
 * Card topics with no suitable verbatim passage in any accepted source. They stay unsourced and are
 * never shipped: this file is not imported by the package entry, so no bundle contains them, and it
 * holds no advice text. Empty since 2026-10-21: water purification (CDC), earthquake, fire and flood
 * (FEMA Ready.gov) were sourced from US federal public-domain pages. The cards' former unsourced texts
 * stay the blocklist of the bundle scan (tools/release-guards/data/unsourced-card-texts.json).
 */
export interface UnsourcedTopic {
  id: string;
  title: string;
  reason: string;
}

export const UNSOURCED_TOPICS: readonly UnsourcedTopic[] = [];
