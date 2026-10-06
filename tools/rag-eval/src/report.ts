import type { LatencySummary } from '@skepi/core';
import type { HeldoutFinding, SetMetrics, SweepRow, ThresholdCheck, TokensPerLang } from './metrics';

export interface ReportInput {
  createdAt: string;
  mode: string;
  promptVersion: string;
  minBigramSupport: number;
  model: string | null;
  threads: number;
  tier: string;
  checks: ThresholdCheck[];
  all: SetMetrics;
  perSet: Record<string, SetMetrics>;
  perLang: Partial<Record<string, SetMetrics>>;
  tokens: TokensPerLang;
  sweep: SweepRow[];
  heldout: { metrics: SetMetrics; findings: HeldoutFinding[]; items: number; status: string | null } | null;
}

const pct = (v: number | null): string => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);
const ms = (s: LatencySummary | null): string => (s === null ? '–' : `${s.p50.toFixed(0)} / ${s.p95.toFixed(0)}`);

const HEADER = [
  'Set',
  'Items',
  'Layer 1 recall',
  'Summary shown',
  'Sentences shown',
  'Citation precision',
  'Unsupported shown',
  'Refusal (no source)',
  'No source at retrieval',
  'Number/unit violations',
  'Forbidden shown',
  'Layer 1 p50/p95 ms',
  'TTFT p50/p95 ms (CPU)',
];

function row(name: string, m: SetMetrics): string {
  return [
    name,
    m.items,
    pct(m.layer1Recall),
    pct(m.summaryShownRate),
    m.shownSentences,
    pct(m.citationPrecision),
    m.unsupportedShown,
    pct(m.refusalWhenNoSource),
    pct(m.noSourceAtRetrieval),
    m.numberUnitViolations,
    m.forbiddenShown,
    ms(m.latency.layer1),
    ms(m.latency.ttft),
  ].join(' | ');
}

export function renderMarkdown(r: ReportInput): string {
  const lines: string[] = [];
  lines.push(`# rag-eval (${r.mode}) · ${r.createdAt}`);
  lines.push('');
  lines.push(`Prompt \`${r.promptVersion}\` · model \`${r.model ?? 'none (Layer 1 only)'}\` · CPU ${r.threads} threads · budget ${r.tier} · min bigram support ${r.minBigramSupport}`);
  lines.push('');
  if (r.checks.length > 0) {
    lines.push('| Threshold | Value | Required | Result |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of r.checks) {
      const value = c.value === null ? '–' : c.kind === 'min' ? pct(c.value) : String(c.value);
      const result = c.pass ? 'PASS' : 'FAIL';
      lines.push(`| ${c.name} | ${value} | ${c.kind === 'min' ? '≥' : '≤'} ${c.threshold} | ${c.gated ? result : `${result} (frozen locale, not gated)`} |`);
    }
    lines.push('');
  }
  lines.push(`| ${HEADER.join(' | ')} |`);
  lines.push(`| ${HEADER.map(() => '---').join(' | ')} |`);
  for (const [name, m] of Object.entries(r.perSet)) lines.push(`| ${row(name, m)} |`);
  for (const [name, m] of Object.entries(r.perLang)) if (m) lines.push(`| ${row(`lang:${name}`, m)} |`);
  lines.push(`| ${row('all', r.all)} |`);
  lines.push('');
  lines.push(`Raw sentences removed by rule: ${Object.entries(r.all.rejected).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  lines.push('');
  lines.push('| Tokens per character | Chars | Tokens | Tokens/char | Estimator / real |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const [lang, t] of Object.entries(r.tokens)) {
    lines.push(t ? `| ${lang} | ${t.chars} | ${t.tokens} | ${t.tokensPerChar.toFixed(3)} | ${t.estimateRatio.toFixed(2)} |` : `| ${lang} | – | – | – | – |`);
  }
  lines.push('');
  lines.push('| Bigram support threshold | Kept | Correct kept | Precision | Recall |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const s of r.sweep) lines.push(`| ${s.minSupport} | ${s.kept} | ${s.correctKept} | ${pct(s.precision)} | ${pct(s.recall)} |`);
  lines.push('');
  if (r.heldout) {
    const h = r.heldout;
    const used = h.status?.startsWith('used for a decision') ?? false;
    lines.push(`## Held-out adversarial set (report only, not gated)${used ? ' — set already used for a decision' : ''}`);
    lines.push('');
    if (h.status) {
      lines.push(`**Status:** ${h.status}`);
      lines.push('');
    }
    lines.push(
      'Written independently of the sanitizer lexicon and the tuned adversarial set. Prompts, lexicon and thresholds are never ' +
        'changed in response to these results; failures are listed with their cause for a decision.',
    );
    lines.push('');
    lines.push(`| ${HEADER.join(' | ')} |`);
    lines.push(`| ${HEADER.map(() => '---').join(' | ')} |`);
    lines.push(`| ${row('adversarial-heldout', h.metrics)} |`);
    lines.push('');
    if (h.findings.length === 0) {
      lines.push('No failures: no unsupported, forbidden or number/unit-violating AI sentence shown, and no forbidden text in Layer 1 passages.');
    } else {
      const esc = (t: string): string => t.replace(/[|]/g, '/');
      lines.push('| Item | Where | Text | Source | Cause |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const f of h.findings) lines.push(`| ${f.id} | ${f.where} | ${esc(f.text)} | ${esc(f.source)} | ${esc(f.causes.join('; '))} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
