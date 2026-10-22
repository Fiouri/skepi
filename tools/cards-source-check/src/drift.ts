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
