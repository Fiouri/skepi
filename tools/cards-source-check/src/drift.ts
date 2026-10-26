import { sha256 } from './source';

/**
 * One changed region between a committed snapshot and the live page text (one block per line): the
 * heading path it sits under, the blocks only in the snapshot and the blocks only on the live page.
 */
export interface ChangedPassage {
  headings: string[];
  removed: string[];
  added: string[];
}

function headingOf(line: string): { level: number; text: string } | null {
  const m = line.match(/^(#{1,6}) (.*)$/u);
  return m ? { level: (m[1] ?? '').length, text: m[2] ?? '' } : null;
}

/** The heading path in force at each line of `lines` (headings before that line). */
function headingPaths(lines: readonly string[]): string[][] {
  const path: string[] = [];
  return lines.map((line) => {
    const at = path.filter((p) => p.length > 0);
    const h = headingOf(line);
    if (h) {
      path.length = h.level - 1;
      path[h.level - 1] = h.text;
    }
    return at;
  });
}

/**
 * The passages that differ between two snapshot texts, block by block (a longest common subsequence of
 * whole lines; a block that changed in one word shows as removed and added). The snapshot header is not
 * part of `before` or `after`. Used by the weekly drift report so the owner sees the changed wording.
 */
export function changedPassages(before: string, after: string): ChangedPassage[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = lcs[i] as number[];
    const next = lcs[i + 1] as number[];
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const pathsA = headingPaths(a);
  const pathsB = headingPaths(b);
  const out: ChangedPassage[] = [];
  let current: ChangedPassage | null = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      current = null;
      i += 1;
      j += 1;
      continue;
    }
    if (current === null) {
      current = { headings: i < n ? (pathsA[i] ?? []) : (pathsB[j] ?? []), removed: [], added: [] };
      out.push(current);
    }
    if (j >= m || (i < n && (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))) {
      current.removed.push(a[i] ?? '');
      i += 1;
    } else {
      current.added.push(b[j] ?? '');
      j += 1;
    }
  }
  return out.filter((p) => p.removed.some((l) => l.length > 0) || p.added.some((l) => l.length > 0));
}

/** A source re-checked against its committed snapshot. */
export type SourceCheck =
  | { status: 'unchanged' }
  | { status: 'file-changed'; fileSha256: string; text: string }
  | { status: 'text-changed'; fileSha256: string; text: string; passages: ChangedPassage[] }
  | { status: 'unchecked'; reason: string };

/**
 * Hash first: the downloaded file is compared with the snapshot's file hash, and only a different file
 * is extracted and its text compared (so an extractor difference can never show as drift of an
 * unchanged file). A download that fails (HTTP 403, a bot challenge, a closed connection) leaves the
 * source unchecked, which is not drift; an extraction failure is thrown.
 */
export async function checkSource(
  committed: { fileSha256: string; text: string },
  download: () => Promise<Uint8Array>,
  extract: (bytes: Uint8Array) => string,
): Promise<SourceCheck> {
  let bytes: Uint8Array;
  try {
    bytes = await download();
  } catch (e) {
    return { status: 'unchecked', reason: e instanceof Error ? e.message : String(e) };
  }
  const fileSha256 = sha256(bytes);
  if (fileSha256 === committed.fileSha256) return { status: 'unchanged' };
  const text = extract(bytes);
  if (text === committed.text) return { status: 'file-changed', fileSha256, text };
  return { status: 'text-changed', fileSha256, text, passages: changedPassages(committed.text, text) };
}

export interface DriftEntry {
  label: string;
  url: string;
  /** Retrieval date of the committed snapshot. */
  since: string;
  result: SourceCheck;
}

/**
 * The drift report and the exit code of the drift command: 1 only for a real text change (or a card
 * step or number no longer on a live page), which the weekly job turns into an issue; sources that
 * could not be checked are listed apart, never as drift. `unfetchable` are sources without a snapshot
 * (UNCHECKED_NUMBER_COUNTRIES), `gone` the lines for steps and numbers no longer shown.
 */
export function driftReport(
  entries: readonly DriftEntry[],
  unfetchable: readonly { label: string; url: string; reason: string }[],
  gone: readonly string[],
): { summary: string; exitCode: 0 | 1 } {
  const changed = entries.filter((e) => e.result.status === 'text-changed').length;
  const unchecked = [...entries.flatMap((e) => (e.result.status === 'unchecked' ? [{ label: e.label, url: e.url, reason: e.result.reason }] : [])), ...unfetchable];
  const lines: string[] = [];
  for (const e of entries) {
    const r = e.result;
    if (r.status === 'unchanged') lines.push(`- ${e.label}: unchanged since ${e.since} (same file).`);
    else if (r.status === 'file-changed') lines.push(`- ${e.label}: file changed (sha256 ${r.fileSha256}), text unchanged.`);
    else if (r.status === 'text-changed') {
      lines.push(`- **${e.label}** (${e.url}): the text changed since the snapshot of ${e.since}. Changed passages:`);
      lines.push(...formatPassages(r.passages));
    }
  }
  const drifted = changed > 0 || gone.length > 0;
  const checked = entries.length - (unchecked.length - unfetchable.length);
  const head = drifted
    ? `Drift in ${String(changed)} of ${String(entries.length)} web sources of the emergency cards and numbers.`
    : `No drift: the ${String(checked)} web sources of the emergency cards and numbers that were checked match their committed snapshots.`;
  const summary = [
    head,
    '',
    ...lines,
    ...gone,
    ...(unchecked.length === 0 ? [] : ['', `Unchecked (not drift): ${String(unchecked.length)} source(s) could not be checked this time.`, ...unchecked.map((u) => `- ${u.label} (${u.url}): ${u.reason}`)]),
    ...(drifted
      ? [
          '',
          'Nothing was updated: the cards keep the snapshot text until the owner decides. If a card should follow the change: `cards-source-check snapshot <id>`, update the hashes in packages/emergency-cards/src/sources.ts and the steps, run the check with `--write-lock`, and get a CODEOWNERS review.',
        ]
      : []),
  ].join('\n');
  return { summary, exitCode: drifted ? 1 : 0 };
}

/** The changed passages as Markdown list lines, indented under the source's drift line. */
export function formatPassages(passages: readonly ChangedPassage[]): string[] {
  const quote = (line: string): string => `"${line.replace(/^- /u, '')}"`;
  const lines: string[] = [];
  for (const p of passages) {
    lines.push(`  - under ${p.headings.length > 0 ? p.headings.map((h) => `"${h}"`).join(' > ') : 'the top of the page'}:`);
    for (const r of p.removed) if (r.length > 0) lines.push(`    - removed: ${quote(r)}`);
    for (const a of p.added) if (a.length > 0) lines.push(`    - added: ${quote(a)}`);
  }
  return lines;
}
