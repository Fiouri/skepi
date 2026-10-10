// Developer Preview entry of @skepi/emergency-cards: the apps' bundlers resolve the package to this file
// when SKEPI_PREVIEW=1 (apps/mobile/metro.config.js, apps/desktop/vite.config.ts). It has the same
// runtime API as index.ts, over cards without any step text, so no unreviewed advice is shipped; the UI
// shows "Under professional review" and the emergency numbers. tools/release-guards checks the bundles.
import { createCardsApi } from './api';
import { PREVIEW_CARDS } from './preview-cards.generated';

export * from './schema';
export * from './numbers';
export { ALLOWED_SOURCE_HOSTS, SOURCES } from './sources';
export { isDraft } from './api';

/** True: card steps are not in this build. */
export const PREVIEW_BUILD: boolean = true;

export const CARDS = PREVIEW_CARDS;
export const { cardById, draftCards, localizeCard, cardsForTopics, findCards, cardsForQuestion } = createCardsApi(PREVIEW_CARDS);
