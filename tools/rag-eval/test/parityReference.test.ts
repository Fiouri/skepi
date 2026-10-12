import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareWithReferences, loadReferences, renderReferenceMarkdown } from '../src/parityReference';
import { loadSet } from '../src/sets';

const DIR = fileURLToPath(new URL('../parity-reference', import.meta.url));

describe('stored parity references', () => {
  it('are the en golden set on every engine, identical to each other', async () => {
    const refs = await loadReferences(DIR);
    expect(refs.map((r) => r.name)).toEqual(['S23', 'desktop', 'rag-eval']);
    const set = await loadSet(fileURLToPath(new URL('../sets/en.json', import.meta.url)));
    const lock = JSON.parse(await readFile(fileURLToPath(new URL('../../../scripts/content.lock.json', import.meta.url)), 'utf8')) as { model: { file: string } };
    const [s23] = refs;
    if (!s23) throw new Error('no S23 reference');
    expect(s23.reference.records.map((r) => [r.id, r.question])).toEqual(set.items.map((i) => [i.id, i.question]));
    expect(s23.reference.config).toEqual({ tier: 'T2', modelId: lock.model.file, contextSize: 2048 });
    for (const r of compareWithReferences(s23.reference, refs)) expect(r.diffs).toEqual([]);
  });

  it('reports a differing question with the expected and the run passages', async () => {
    const refs = await loadReferences(DIR);
    const [s23] = refs;
    if (!s23) throw new Error('no S23 reference');
    const run = structuredClone({ ...s23.reference, engine: 'ios' });
    const changed = run.records.find((r) => r.sources.length > 1);
    if (!changed) throw new Error('no record with two sources');
    const expected = changed.sources.map((s) => s.chunk).join(', ');
    changed.sources.reverse();
    const results = compareWithReferences(run, refs);
    expect(results.map((r) => r.diffs.map((d) => [d.id, d.step]))).toEqual(refs.map(() => [[changed.id, 'sources']]));
    const md = renderReferenceMarkdown(run, results);
    expect(md).toContain('| S23 | android |');
    expect(md).toContain(`| ${changed.id} | ${changed.question} | sources |`);
    expect(md).toContain(`| ${expected} | ${changed.sources.map((s) => s.chunk).join(', ')} |`);
  });

  it('refuses a run with another retrieval config', async () => {
    const refs = await loadReferences(DIR);
    const [s23] = refs;
    if (!s23) throw new Error('no S23 reference');
    expect(() => compareWithReferences({ ...s23.reference, config: { ...s23.reference.config, tier: 'T1' } }, refs)).toThrow(/config/);
  });
});
