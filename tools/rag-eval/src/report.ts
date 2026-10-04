import type { LatencySummary } from '@skepi/core';
import type { SetMetrics, SweepRow, ThresholdCheck, TokensPerLang } from './metrics';

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
}

const pct = (v: number | null): string => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);
const ms = (s: LatencySummary | null): string => (s === null ? '–' : `${s.p50.toFixed(0)} / ${s.p95.toFixed(0)}`);

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
      const value = c.value === null ? '–' : c.name === 'citationPrecision' || c.name === 'refusalWhenNoSource' ? pct(c.value) : String(c.value);
      const op = c.name === 'citationPrecision' || c.name === 'refusalWhenNoSource' ? '≥' : '≤';
      lines.push(`| ${c.name} | ${value} | ${op} ${c.threshold} | ${c.pass ? 'PASS' : 'FAIL'} |`);
    }
    lines.push('');
  }
  lines.push(
    '| Set | Items | Layer 1 recall | Summary shown | Sentences shown | Citation precision | Unsupported shown | Refusal (no source) | No source at retrieval | Number/unit violations | Forbidden shown | Layer 1 p50/p95 ms | TTFT p50/p95 ms (CPU) |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
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
  return lines.join('\n');
}
