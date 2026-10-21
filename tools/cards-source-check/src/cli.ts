/**
 * Usage (from the repository root):
 *   node node_modules/tsx/dist/cli.mjs tools/cards-source-check/src/cli.ts [--cache-dir <dir>] [--pdf <file>] [--write-lock]
 *
 * Downloads the IFRC guidelines PDF from the pinned URL (or takes --pdf), checks the pinned SHA-256,
 * extracts the text with pdftotext and fails unless every card step is an exact substring of the cited
 * printed page (after the whitespace/hyphenation/quote normalisation in check.ts). Then:
 * - without --write-lock (CI): packages/emergency-cards/source-check.lock.json must record exactly
 *   these cards; the release builds and bundle scans trust that lock;
 * - with --write-lock (after a deliberate card change): writes the lock.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARDS, IFRC_GUIDELINES } from '@skepi/emergency-cards';
import { expectedLock, lockProblem, SOURCE_CHECK_LOCK } from '@skepi/emergency-cards/digest';
import { checkCards, splitPages } from './check';
import { extractText, fetchPinned, pdftotextBinary, pdftotextVersion, sha256 } from './source';
import { readFileSync } from 'node:fs';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<number> {
  const writeLock = process.argv.includes('--write-lock');
  const cacheDir = resolve(arg('--cache-dir') ?? '.cache/ifrc');
  const local = arg('--pdf');
  let pdf: string;
  if (local) {
    pdf = resolve(local);
    const got = sha256(readFileSync(pdf));
    if (got !== IFRC_GUIDELINES.sha256) throw new Error(`${pdf}: SHA-256 ${got}, pinned ${IFRC_GUIDELINES.sha256}`);
  } else {
    pdf = await fetchPinned(IFRC_GUIDELINES.url, IFRC_GUIDELINES.sha256, cacheDir);
  }
  const bin = pdftotextBinary();
  console.log(`source: IFRC ${IFRC_GUIDELINES.title} ${IFRC_GUIDELINES.edition} (sha256 ${IFRC_GUIDELINES.sha256})`);
  console.log(`pdftotext: ${pdftotextVersion(bin)}`);
  const pages = splitPages(extractText(pdf, bin));
  const results = checkCards(pages, CARDS);
  for (const card of CARDS) {
    const mine = results.filter((r) => r.card === card.id);
    const bad = mine.filter((r) => !r.ok);
    console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'} ${card.id}: ${String(mine.length - bad.length)}/${String(mine.length)} steps`);
    for (const r of bad) console.error(`  step ${String(r.step)} ("${r.section}", p. ${String(r.page)}): ${r.problem ?? ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.error(`CARDS SOURCE CHECK FAIL: ${String(failed)} of ${String(results.length)} steps are not verbatim at the cited page (${String(pages.length)} pages)`);
    return 1;
  }
  console.log(`CARDS SOURCE CHECK PASS: ${String(results.length)} steps of ${String(CARDS.length)} cards verbatim at the cited pages (${String(pages.length)} pages)`);
  if (writeLock) {
    writeFileSync(SOURCE_CHECK_LOCK, `${JSON.stringify(expectedLock(), null, 2)}\n`);
    console.log(`wrote ${SOURCE_CHECK_LOCK}`);
    return 0;
  }
  const problem = lockProblem();
  if (problem !== null) {
    console.error(`CARDS SOURCE CHECK FAIL: ${problem}; run with --write-lock and commit ${SOURCE_CHECK_LOCK}`);
    return 1;
  }
  console.log('source-check.lock.json matches the checked cards');
  return 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (e: unknown) => {
    console.error(`CARDS SOURCE CHECK ERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
