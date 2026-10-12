import { compareParity, type ParityDiff, type ParityRecord, type ParityReport } from '@skepi/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

/**
 * Stored retrieval parity runs (hardening, 2026-10-11; 108/108 identical to each other): the Galaxy S23
 * (libkiwix AAR + jsoup), the Windows desktop engine (Rust libzim 9.7.0 + text.rs) and rag-eval
 * (python-libzim + BeautifulSoup), all on the zimDefault packs of scripts/content.lock.json.
 * A new engine (the iOS Simulator) is compared with each of them without rerunning anything.
 */
export const PARITY_REFERENCES = [
  { name: 'S23', file: 's23.json.gz' },
  { name: 'desktop', file: 'desktop.json.gz' },
  { name: 'rag-eval', file: 'rag-eval.json.gz' },
] as const;

export interface ReferenceResult {
  name: string;
  reference: ParityReport;
  diffs: ParityDiff[];
}

export async function loadReport(path: string): Promise<ParityReport> {
  const raw = await readFile(path);
  const text = path.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const report = JSON.parse(text) as Partial<ParityReport>;
  if (report.schema !== 1 || !Array.isArray(report.records) || !report.config) throw new Error(`${path}: not a parity report`);
  return report as ParityReport;
}

export async function loadReferences(dir: string): Promise<{ name: string; reference: ParityReport }[]> {
  const out = [];
  for (const r of PARITY_REFERENCES) out.push({ name: r.name, reference: await loadReport(join(dir, r.file)) });
  return out;
}

/** Each stored reference against `run` (reference first: diff details read "reference vs run"). */
export function compareWithReferences(run: ParityReport, references: readonly { name: string; reference: ParityReport }[]): ReferenceResult[] {
  return references.map(({ name, reference }) => {
    if (JSON.stringify(reference.config) !== JSON.stringify(run.config)) {
      throw new Error(`${name}: config ${JSON.stringify(reference.config)} differs from the run's ${JSON.stringify(run.config)}`);
    }
    return { name, reference, diffs: compareParity(reference, run) };
  });
}

function passages(r: ParityRecord | undefined): string {
  if (!r) return '(missing)';
  if (r.sources.length === 0) return `none (${r.status}${r.noSourceReason ? `/${r.noSourceReason}` : ''})`;
  return r.sources.map((s) => s.chunk).join(', ');
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 600);
}

/** Summary per reference, then every differing question with the expected and the run's passages. */
export function renderReferenceMarkdown(run: ParityReport, results: readonly ReferenceResult[]): string {
  const lines = [
    `# Retrieval parity · ${run.engine} vs stored references · ${run.createdAt}`,
    '',
    `Config ${JSON.stringify(run.config)} · archives (${run.engine}): ${run.archives.map((a) => `${a.name} (${a.language}, ${a.articleCount})`).join(', ')}`,
    '',
    '| Reference | Engine | Run at | Queries | Identical | Different |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const different = new Set(r.diffs.map((d) => d.id)).size;
    lines.push(`| ${r.name} | ${r.reference.engine} | ${r.reference.createdAt} | ${r.reference.records.length} | ${r.reference.records.length - different} | ${different} |`);
  }
  lines.push('');
  const runById = new Map(run.records.map((x) => [x.id, x]));
  for (const r of results) {
    if (r.diffs.length === 0) continue;
    const refById = new Map(r.reference.records.map((x) => [x.id, x]));
    const steps = new Map<string, number>();
    for (const d of r.diffs) steps.set(d.step, (steps.get(d.step) ?? 0) + 1);
    lines.push(`## ${r.name} vs ${run.engine}`, '', `First diverging step: ${[...steps].map(([s, n]) => `${s} ${n}`).join(', ')}`, '');
    lines.push(`| Id | Query | Step | Detail (${r.name} vs ${run.engine}) | Expected passages (${r.name}) | ${run.engine} passages |`, '| --- | --- | --- | --- | --- | --- |');
    for (const d of r.diffs) {
      lines.push(`| ${d.id} | ${cell(d.question)} | ${d.step} | ${cell(d.detail)} | ${cell(passages(refById.get(d.id)))} | ${cell(passages(runById.get(d.id)))} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
