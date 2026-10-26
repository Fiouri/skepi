import { describe, expect, it } from 'vitest';
import { changedPassages, checkSource, driftReport, formatPassages, type DriftEntry } from '../src/drift';
import { sha256 } from '../src/source';

const BEFORE = ['# Floods', 'Intro.', '## During a Flood', '- Evacuate if told to evacuate.', '- Do not walk through flood waters.', '## After a Flood', '- Stay away from power lines.'].join('\n');

describe('changedPassages', () => {
  it('finds nothing when the text is the same', () => {
    expect(changedPassages(BEFORE, BEFORE)).toEqual([]);
  });

  it('shows a reworded block as removed and added under its headings', () => {
    const after = BEFORE.replace('- Do not walk through flood waters.', '- Do not walk, swim or drive through flood waters.');
    expect(changedPassages(BEFORE, after)).toEqual([
      { headings: ['Floods', 'During a Flood'], removed: ['- Do not walk through flood waters.'], added: ['- Do not walk, swim or drive through flood waters.'] },
    ]);
  });

  it('reports separate changes separately, including additions and removals', () => {
    const after = BEFORE.replace('Intro.\n', '').concat('\n- Clean and disinfect everything that got wet.');
    expect(changedPassages(BEFORE, after)).toEqual([
      { headings: ['Floods'], removed: ['Intro.'], added: [] },
      { headings: ['Floods', 'After a Flood'], removed: [], added: ['- Clean and disinfect everything that got wet.'] },
    ]);
  });

  it('formats the passages for the drift issue', () => {
    const after = BEFORE.replace('- Stay away from power lines.', '- Stay away from downed power lines.');
    expect(formatPassages(changedPassages(BEFORE, after))).toEqual([
      '  - under "Floods" > "After a Flood":',
      '    - removed: "Stay away from power lines."',
      '    - added: "Stay away from downed power lines."',
    ]);
  });
});

describe('checkSource (hash first)', () => {
  const FILE = new TextEncoder().encode('<main>file bytes</main>');
  const committed = { fileSha256: sha256(FILE), text: BEFORE };
  const never = (): string => {
    throw new Error('extracted an unchanged file');
  };

  it('a file with the snapshot hash is unchanged without extracting it, whatever the extractor would give', async () => {
    expect(await checkSource(committed, () => Promise.resolve(FILE), never)).toEqual({ status: 'unchanged' });
  });

  it('a different file is extracted: same text is a file change only, other text is drift with passages', async () => {
    const other = new TextEncoder().encode('<main>new bytes</main>');
    expect(await checkSource(committed, () => Promise.resolve(other), () => BEFORE)).toEqual({ status: 'file-changed', fileSha256: sha256(other), text: BEFORE });
    const after = BEFORE.replace('Intro.', 'New intro.');
    expect(await checkSource(committed, () => Promise.resolve(other), () => after)).toEqual({
      status: 'text-changed',
      fileSha256: sha256(other),
      text: after,
      passages: [{ headings: ['Floods'], removed: ['Intro.'], added: ['New intro.'] }],
    });
  });

  it('a download that fails (HTTP 403) leaves the source unchecked; an extraction failure is thrown', async () => {
    const blocked = (): Promise<Uint8Array> => Promise.reject(new Error('download failed: HTTP 403 https://example.org/112'));
    expect(await checkSource(committed, blocked, never)).toEqual({ status: 'unchecked', reason: 'download failed: HTTP 403 https://example.org/112' });
    const other = new TextEncoder().encode('changed');
    await expect(checkSource(committed, () => Promise.resolve(other), () => never())).rejects.toThrow('extracted an unchanged file');
  });
});

describe('driftReport', () => {
  const unchanged: DriftEntry = { label: 'ready-floods', url: 'https://www.ready.gov/floods', since: '2026-10-21', result: { status: 'unchanged' } };
  const blocked: DriftEntry = { label: 'numbers ec-112', url: 'https://example.eu/112', since: '2026-10-23', result: { status: 'unchecked', reason: 'download failed: HTTP 403 https://example.eu/112' } };
  const fileOnly: DriftEntry = { label: 'numbers gov-uk-999', url: 'https://www.gov.uk/999', since: '2026-10-23', result: { status: 'file-changed', fileSha256: 'f'.repeat(64), text: 'x' } };
  const au = { label: 'numbers AU', url: 'https://www.triplezero.gov.au/', reason: 'no snapshot: the official site refuses automated requests (UNCHECKED_NUMBER_COUNTRIES)' };

  it('blocked and unfetchable sources are listed as unchecked, not drift (exit 0, no issue)', () => {
    const { summary, exitCode } = driftReport([unchanged, blocked, fileOnly], [au], []);
    expect(exitCode).toBe(0);
    expect(summary).toMatch(/^No drift: the 2 web sources .* that were checked match their committed snapshots\./u);
    expect(summary).toContain('Unchecked (not drift): 2 source(s) could not be checked this time.');
    expect(summary).toContain('- numbers ec-112 (https://example.eu/112): download failed: HTTP 403 https://example.eu/112');
    expect(summary).toContain('- numbers AU (https://www.triplezero.gov.au/): no snapshot');
    expect(summary).toContain('- numbers gov-uk-999: file changed');
    expect(summary).not.toContain('Nothing was updated');
  });

  it('only a real text change (or a step or number gone) is drift (exit 1)', () => {
    const after = BEFORE.replace('Intro.', 'New intro.');
    const changed: DriftEntry = { ...unchanged, result: { status: 'text-changed', fileSha256: 'e'.repeat(64), text: after, passages: changedPassages(BEFORE, after) } };
    const report = driftReport([changed, blocked], [], []);
    expect(report.exitCode).toBe(1);
    expect(report.summary).toMatch(/^Drift in 1 of 2 web sources/u);
    expect(report.summary).toContain('- **ready-floods** (https://www.ready.gov/floods): the text changed since the snapshot of 2026-10-21.');
    expect(report.summary).toContain('    - added: "New intro."');
    expect(report.summary).toContain('Nothing was updated');
    expect(driftReport([unchanged], [], ['- **card flood, step 2** gone']).exitCode).toBe(1);
  });
});
