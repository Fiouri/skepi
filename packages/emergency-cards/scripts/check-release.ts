/**
 * Release gate for the bundled emergency cards (run by the Android release build, see
 * apps/mobile/plugins/withEmergencyCards.js):
 * - every card must pass the structural checks;
 * - draft cards (not reviewed by first-aid professionals) fail the build, unless `--allow-draft`
 *   is given (Gradle: -PskepiAllowDraftCards=true), which is for internal testing builds only;
 * - `--preview` (Gradle: -PskepiPreview=true, Developer Preview builds) passes with drafts, because those
 *   builds bundle the preview entry without any step text; the bundle itself is checked after it is
 *   built (tools/release-guards preview-cards).
 */
import { CARDS, draftCards, validateCards } from '../src/index';

const allowDraft = process.argv.includes('--allow-draft');
const preview = process.argv.includes('--preview');

const problems = validateCards();
if (problems.length > 0) {
  for (const p of problems) console.error(`SKEPI emergency cards: ${p.card}: ${p.problem}`);
  process.exit(1);
}

const drafts = draftCards();
if (drafts.length === 0) {
  console.log(`SKEPI emergency cards: ${String(CARDS.length)} cards, all reviewed.`);
  process.exit(0);
}

const list = drafts.map((c) => c.id).join(', ');
if (preview) {
  console.log(
    `SKEPI emergency cards: Developer Preview build: ${String(drafts.length)} draft cards (${list}) ship without any step text ("Under professional review"); the bundle is checked after it is built.`,
  );
  process.exit(0);
}
if (!allowDraft) {
  console.error(
    [
      `SKEPI: ${String(drafts.length)} of ${String(CARDS.length)} emergency cards are DRAFT (not reviewed by first-aid professionals): ${list}.`,
      'A release build must not ship draft cards. For an internal testing build only, pass -PskepiAllowDraftCards=true.',
    ].join('\n'),
  );
  process.exit(1);
}

const bar = '!'.repeat(100);
console.warn(
  [
    bar,
    `!!! SKEPI WARNING: this release build bundles ${String(drafts.length)} DRAFT emergency cards (${list}).`,
    '!!! They are NOT reviewed by first-aid professionals and show a permanent "Draft" banner.',
    '!!! INTERNAL TESTING ONLY (-PskepiAllowDraftCards=true). Never publish this build.',
    bar,
  ].join('\n'),
);
