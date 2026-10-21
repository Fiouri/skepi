// Developer Preview entry of @skepi/emergency-cards: the apps' bundlers resolve the package to this file
// when SKEPI_PREVIEW=1 (apps/mobile/metro.config.js, apps/desktop/vite.config.ts). Since 2026-10-21 the
// cards are verbatim IFRC excerpts and ship in every build mode: this entry has the same cards and only
// turns the permanent "Developer preview — not for emergency use" label on.
export * from './index';

/** True: a Developer Preview build. */
export const PREVIEW_BUILD: boolean = true;
