/**
 * Writes src/preview-cards.generated.ts: the cards for Developer Preview builds, from the full cards,
 * keeping only what is not advice (id, intercept topics, titles, search keywords, review status) and no
 * step text. `pnpm --filter @skepi/emergency-cards export-preview`; test/preview.test.ts fails when the
 * committed file is stale.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { previewCardsSource } from '../src/preview-source';

const out = fileURLToPath(new URL('../src/preview-cards.generated.ts', import.meta.url));
writeFileSync(out, previewCardsSource());
console.log(`wrote ${out}`);
