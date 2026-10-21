/**
 * Usage (from the repository root):
 *   tsx tools/release-guards/src/cards-bundle-cli.ts [--expect-sourced] <file or folder>...
 * Folders: every .js, .bundle, .hbc file inside. Fails when
 * - no bundle file is found;
 * - any unsourced card text is in the bundles;
 * - sourced (IFRC) card steps are in the bundles but packages/emergency-cards/source-check.lock.json
 *   does not record a passed tools/cards-source-check of exactly these steps;
 * - with --expect-sourced (release builds): not every sourced step is found (the cards must ship).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lockProblem } from '@skepi/emergency-cards/digest';
import { findTexts, probeOf, sourcedTexts, unsourcedTexts } from './cards-bundle';

const BUNDLE = /\.(js|bundle|hbc)$/;

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(path, e.name)) : BUNDLE.test(e.name) ? [join(path, e.name)] : []));
}

const expectSourced = process.argv.includes('--expect-sourced');
const targets = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'))
  .map((p) => resolve(p));
if (targets.length === 0) {
  console.error('usage: cards-bundle-cli.ts [--expect-sourced] <bundle file or folder>...');
  process.exit(2);
}
const paths = targets.flatMap(files);
if (paths.length === 0) {
  console.error('CARDS BUNDLE FAIL: no bundle file found');
  process.exit(1);
}
const bundles = paths.map((p) => new Uint8Array(readFileSync(p)));
const unsourced = unsourcedTexts();
const sourced = sourcedTexts();
const badHits = findTexts(bundles, unsourced);
const goodHits = findTexts(bundles, sourced);
const probedSourced = sourced.filter((t) => probeOf(t) !== null).length;
let failed = false;
for (const h of badHits) console.error(`unsourced card text in a bundle: "${h.slice(0, 80)}…"`);
if (badHits.length > 0) {
  console.error(`CARDS BUNDLE FAIL: ${String(badHits.length)} unsourced card texts in ${String(paths.length)} bundle files`);
  failed = true;
}
const lock = lockProblem();
if (goodHits.length > 0 && lock !== null) {
  console.error(`CARDS BUNDLE FAIL: ${String(goodHits.length)} sourced card steps shipped without a passed source check (${lock})`);
  failed = true;
}
if (expectSourced && goodHits.length < probedSourced) {
  const missing = sourced.filter((t) => probeOf(t) !== null && !goodHits.includes(t));
  for (const m of missing.slice(0, 5)) console.error(`sourced step not found: "${m.slice(0, 80)}…"`);
  console.error(`CARDS BUNDLE FAIL: ${String(goodHits.length)}/${String(probedSourced)} sourced card steps found (--expect-sourced)`);
  failed = true;
}
if (failed) process.exit(1);
console.log(
  `CARDS BUNDLE PASS: unsourced steps 0/${String(unsourced.length)}; sourced steps ${String(goodHits.length)}/${String(probedSourced)} (source check lock ${lock === null ? 'ok' : 'not needed'}) in ${String(paths.length)} bundle files`,
);
