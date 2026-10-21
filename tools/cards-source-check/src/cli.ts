/**
 * Usage (from the repository root):
 *   node node_modules/tsx/dist/cli.mjs tools/cards-source-check/src/cli.ts [--cache-dir <dir>] [--pdf <file>] [--write-lock]
 *   node node_modules/tsx/dist/cli.mjs tools/cards-source-check/src/cli.ts drift [--report <file.md>]
 *   node node_modules/tsx/dist/cli.mjs tools/cards-source-check/src/cli.ts snapshot <source id>
 *
 * check (default): every card step must be an exact excerpt of its source.
 * - IFRC PDF: downloaded from the pinned URL (or --pdf), SHA-256 checked, text extracted with pdftotext;
 *   the step must be a substring of the cited printed page (normalisation in check.ts).
 * - CDC / Ready.gov web pages: the committed snapshot (snapshots/<id>.txt) must carry the URL, retrieval
 *   date and HTML hash of packages/emergency-cards/src/sources.ts and the pinned text hash; the step must
 *   be a substring of one block under the cited heading. No network.
 * Then without --write-lock (CI) packages/emergency-cards/source-check.lock.json must record exactly
 * these cards and sources (the release builds and bundle scans trust that lock); with --write-lock
 * (after a deliberate card change) it writes the lock.
 *
 * drift: re-fetches every web source and reports a changed page (HTML or text) and any card step no
 * longer on the live page; exit 1 on drift (the weekly CI job turns it into an issue, never a failed
 * build). The CDC asks reusers to check its pages for revisions.
 *
 * snapshot <id>: re-fetches one web source and rewrites its snapshot with today's date; prints the new
 * hashes to pin in sources.ts (then run the check with --write-lock).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARDS, IFRC_GUIDELINES, SOURCES, WEB_SOURCES, type SourceId } from '@skepi/emergency-cards';
import { expectedLock, lockProblem, SOURCE_CHECK_LOCK } from '@skepi/emergency-cards/digest';
import { checkCards, checkWebSteps, splitPages, type StepResult } from './check';
import { fetchPage, formatSnapshot, readSnapshot, snapshotPath, textSha256 } from './snapshot';
import { extractText, fetchPinned, pdftotextBinary, pdftotextVersion, sha256 } from './source';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** The committed snapshots, after checking each against its pinned source; problems are listed. */
function snapshots(problems: string[]): Map<SourceId, string> {
  const out = new Map<SourceId, string>();
  for (const w of WEB_SOURCES) {
    let snap;
    try {
      snap = readSnapshot(w.id);
    } catch (e) {
      problems.push(`${w.id}: ${e instanceof Error ? e.message : String(e)} (${snapshotPath(w.id)})`);
      continue;
    }
    if (snap.url !== w.url) problems.push(`${w.id}: snapshot URL ${snap.url}, sources.ts ${w.url}`);
    if (snap.retrieved !== w.accessed) problems.push(`${w.id}: snapshot retrieved ${snap.retrieved}, sources.ts ${w.accessed}`);
    if (snap.htmlSha256 !== w.htmlSha256) problems.push(`${w.id}: snapshot HTML hash ${snap.htmlSha256}, sources.ts ${w.htmlSha256}`);
    const got = textSha256(snap.text);
    if (got !== w.textSha256) problems.push(`${w.id}: snapshot text hash ${got}, sources.ts ${w.textSha256}`);
    out.set(w.id, snap.text);
  }
  return out;
}

function report(results: readonly StepResult[]): number {
  for (const card of CARDS) {
    const mine = results.filter((r) => r.card === card.id);
    const bad = mine.filter((r) => !r.ok);
    const sources = [...new Set(mine.map((r) => r.source))].join(', ');
    console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'} ${card.id}: ${String(mine.length - bad.length)}/${String(mine.length)} steps (${sources})`);
    for (const r of bad) console.error(`  step ${String(r.step)} ("${r.section}"${r.page === null ? '' : `, p. ${String(r.page)}`}): ${r.problem ?? ''}`);
  }
  return results.filter((r) => !r.ok).length;
}

async function check(): Promise<number> {
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
  const problems: string[] = [];
  const snaps = snapshots(problems);
  for (const w of WEB_SOURCES) console.log(`source: ${w.id} "${w.title}" ${w.url} (retrieved ${w.accessed}, snapshot text sha256 ${w.textSha256})`);
  for (const p of problems) console.error(`snapshot: ${p}`);
  const results = [...checkCards(pages, CARDS), ...checkWebSteps(snaps, CARDS)];
  const steps = CARDS.reduce((n, c) => n + c.steps.length, 0);
  if (results.length !== steps) problems.push(`${String(steps - results.length)} steps cite no known source`);
  const failed = report(results);
  if (failed > 0 || problems.length > 0) {
    console.error(`CARDS SOURCE CHECK FAIL: ${String(failed)} of ${String(results.length)} steps are not verbatim at the cited place; ${String(problems.length)} source problems`);
    return 1;
  }
  console.log(
    `CARDS SOURCE CHECK PASS: ${String(results.length)} steps of ${String(CARDS.length)} cards verbatim at the cited places (IFRC PDF ${String(pages.length)} pages, ${String(snaps.size)} web snapshots)`,
  );
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

async function drift(): Promise<number> {
  const lines: string[] = [];
  const live = new Map<SourceId, string>();
  let drifted = 0;
  for (const w of WEB_SOURCES) {
    const committed = readSnapshot(w.id);
    let page;
    try {
      page = await fetchPage(w.url);
    } catch (e) {
      drifted += 1;
      lines.push(`- **${w.id}** (${w.url}): could not be fetched: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    live.set(w.id, page.text);
    if (page.text !== committed.text) {
      drifted += 1;
      lines.push(`- **${w.id}** (${w.url}): the page text changed since the snapshot of ${committed.retrieved}.`);
    } else if (page.htmlSha256 !== committed.htmlSha256) {
      lines.push(`- ${w.id}: HTML changed (sha256 ${page.htmlSha256}), text unchanged.`);
    } else {
      lines.push(`- ${w.id}: unchanged since ${committed.retrieved}.`);
    }
  }
  const gone = checkWebSteps(live, CARDS).filter((r) => !r.ok && live.has(r.source));
  for (const r of gone) lines.push(`- **card ${r.card}, step ${String(r.step)}** ("${r.section}", ${r.source}): ${r.problem ?? ''} on the live page.`);
  const summary = [
    drifted === 0 ? 'No drift: every web source of the emergency cards matches its committed snapshot.' : `Drift in ${String(drifted)} of ${String(WEB_SOURCES.length)} web sources of the emergency cards.`,
    '',
    ...lines,
    '',
    drifted === 0
      ? ''
      : 'Review the change on the live page. If the card steps should follow it: `cards-source-check snapshot <id>`, update the hashes in packages/emergency-cards/src/sources.ts and the steps, run the check with `--write-lock`, and get a CODEOWNERS review.',
  ].join('\n');
  console.log(summary);
  const out = arg('--report');
  if (out) writeFileSync(resolve(out), `${summary}\n`);
  return drifted === 0 && gone.length === 0 ? 0 : 1;
}

async function snapshot(): Promise<number> {
  const id = process.argv[3] as SourceId | undefined;
  const source = id ? (SOURCES as Partial<Record<string, (typeof SOURCES)[SourceId]>>)[id] : undefined;
  if (!id || source?.kind !== 'html') {
    console.error(`usage: cli.ts snapshot <${WEB_SOURCES.map((w) => w.id).join('|')}>`);
    return 2;
  }
  const page = await fetchPage(source.url);
  const retrieved = new Date().toISOString().slice(0, 10);
  writeFileSync(snapshotPath(id), formatSnapshot({ url: source.url, retrieved, htmlSha256: page.htmlSha256, text: page.text }));
  console.log(`wrote ${snapshotPath(id)}\npin in packages/emergency-cards/src/sources.ts: accessed '${retrieved}', htmlSha256 '${page.htmlSha256}', textSha256 '${textSha256(page.text)}'`);
  return 0;
}

const commands: Record<string, () => Promise<number>> = { drift, snapshot };
const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'check';
(commands[command] ?? check)().then(
  (code) => {
    process.exit(code);
  },
  (e: unknown) => {
    console.error(`CARDS SOURCE CHECK ERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
