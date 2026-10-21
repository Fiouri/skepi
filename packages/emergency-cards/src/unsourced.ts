/**
 * Card topics with no passage in the IFRC guidelines (searched 2026-10-21 in the 2025 edition: the
 * "Disaster" chapter addresses first aid programme designers, not the public). They stay unsourced and
 * are never shipped: this file is not imported by the package entry, so no bundle contains them, and it
 * holds no advice text. Their former texts (US public-domain material) are the blocklist of the bundle
 * scan (tools/release-guards/data/unsourced-card-texts.json).
 */
export interface UnsourcedTopic {
  id: string;
  title: string;
  reason: string;
}

const NO_PASSAGE = 'No IFRC guideline passage with first aid steps for the public (2025 edition).';

export const UNSOURCED_TOPICS: readonly UnsourcedTopic[] = [
  { id: 'water-purification', title: 'Making water safe to drink', reason: NO_PASSAGE },
  { id: 'earthquake', title: 'Earthquake', reason: NO_PASSAGE },
  { id: 'fire', title: 'Fire at home', reason: NO_PASSAGE },
  { id: 'flood', title: 'Flood', reason: NO_PASSAGE },
];
