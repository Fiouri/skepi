/**
 * Release gate for the bundled emergency cards (run by every release build: Android Gradle
 * `skepiCheckEmergencyCards` (apps/mobile/plugins/withEmergencyCards.js), iOS build phase
 * (apps/mobile/plugins/ios/skepi-xcode.sh)):
 * - every card must pass the structural checks (each step cited with section and page);
 * - the card steps must be exactly the ones the last passed tools/cards-source-check verified against
 *   their sources (the IFRC PDF, the CDC / Ready.gov snapshots; source-check.lock.json). CI re-runs the
 *   source check itself on every change.
 */
import { lockProblem } from '../src/digest';
import { CARDS, validateCards } from '../src/index';

const problems = validateCards();
for (const p of problems) console.error(`SKEPI emergency cards: ${p.card}: ${p.problem}`);
const lock = lockProblem();
if (lock !== null) {
  console.error(
    `SKEPI emergency cards: ${lock}. Every step must be verbatim source text: run tools/cards-source-check (--write-lock) and commit packages/emergency-cards/source-check.lock.json.`,
  );
}
if (problems.length > 0 || lock !== null) process.exit(1);
const steps = CARDS.reduce((n, c) => n + c.steps.length, 0);
console.log(`SKEPI emergency cards: ${String(CARDS.length)} cards, ${String(steps)} steps, all sourced and source-checked.`);
