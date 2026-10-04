import type { LoadOptions } from '@skepi/contracts';
import { buildPrompt, chunkArticle, detectLanguage, estimateTokens, PROMPT_VERSION, runRag, summarize, type LatencySummary } from '@skepi/core';
import { ExpoZim, type ZimArchiveInfo } from 'expo-zim';
import { knowledge, llama, loadOptions, T1_CONTEXT, useContent } from './content';

/** 20 fixed title prefixes typed into the suggestion box. */
export const SUGGEST_QUERIES = [
  'Αθ', 'Πάτ', 'Ελλ', 'Θεσ', 'Κρή', 'σεισ', 'νερ', 'Όλυμ', 'Αριστ', 'Βυζ',
  'ηφαί', 'Μακε', 'Πελο', 'Ευρώ', 'Ηλι', 'Σωκ', 'Ρώμ', 'φάρμ', 'θάλα', 'Αχα',
];

/** 20 fixed full-text queries (single and multi-term). */
export const FULLTEXT_QUERIES = [
  'Πάτρα', 'Αθήνα', 'σεισμός', 'νερό', 'πυρκαγιά', 'πλημμύρα', 'ηφαίστειο', 'Όλυμπος', 'δημοκρατία', 'Αριστοτέλης',
  'Βυζαντινή Αυτοκρατορία', 'Ολυμπιακοί Αγώνες', 'καρδιά αίμα', 'ηλεκτρική ενέργεια', 'Πελοπόννησος πόλη',
  'Μέγας Αλέξανδρος', 'θάλασσα ψάρια', 'ελιά λάδι', 'Αχαΐα', 'Ευρωπαϊκή Ένωση',
];

/** Same words in different case/accent forms: shows whether ICU data changes matching. */
export const ACCENT_PROBE = ['Πάτρα', 'πατρα', 'ΠΑΤΡΑ', 'σεισμός', 'σεισμος', 'ΣΕΙΣΜΟΣ', 'Αχαΐα', 'αχαια'];

export const BENCH_RAG_QUESTION = 'Πού βρίσκεται η Πάτρα και πόσους κατοίκους έχει;';

export const GATES = {
  suggestP95Ms: 50,
  fulltextP95Ms: 300,
  articleOpenMs: 500,
  modelLoadMs: 10_000,
  ttftMs: 4_000,
} as const;

export interface PrefillSample {
  model: string;
  label: string;
  threads: number;
  affinity: number[] | null;
  flashAttention: boolean | null;
  loadMs: number;
  promptTokens: number;
  ttftMs: number | null;
  promptTokensPerSecond: number;
}

interface Timed {
  totalMs: number;
  nativeMs: number;
}

export interface BenchReport {
  schema: 1;
  createdAt: string;
  promptVersion: string;
  device: Awaited<ReturnType<typeof ExpoZim.getDeviceInfo>>;
  cpu: Awaited<ReturnType<typeof ExpoZim.getCpuInfo>>;
  snapshotBefore: Awaited<ReturnType<typeof ExpoZim.getDeviceSnapshot>>;
  runtime: Awaited<ReturnType<typeof ExpoZim.getRuntimeInfo>>;
  archives: Pick<ZimArchiveInfo, 'archiveId' | 'name' | 'title' | 'articleCount' | 'sizeBytes' | 'openMs' | 'hasFulltextIndex'>[];
  suggest: { total: LatencySummary; native: LatencySummary; results: number[] };
  fulltext: { total: LatencySummary; native: LatencySummary; results: number[] };
  articleHtml: { total: LatencySummary; native: LatencySummary; bytes: number[] };
  plainText: { total: LatencySummary; native: LatencySummary; sections: number[] };
  accentProbe: { query: string; suggest: string[]; fulltext: string[]; fulltextEstimated: number }[];
  prefillSweep: PrefillSample[];
  model: null | {
    id: string;
    sizeBytes: number;
    threads: number;
    contextSize: number;
    loadMs: number;
    description: string;
    rag: {
      question: string;
      status: string;
      sources: number;
      promptTokens: number;
      generatedTokens: number;
      ttftMs: number | null;
      tokensPerSecond: number | null;
      cited: string[];
      retrievalMs: number;
      extractMs: number;
    };
    tokenEstimate: { samples: number; estimated: number; actual: number; ratio: number };
  };
  memory: Awaited<ReturnType<typeof ExpoZim.getMemoryInfo>>;
  gates: Record<string, { value: number | null; gate: number; pass: boolean | null }>;
  reportPath: string | null;
}

async function timed<T extends { nativeMs: number }>(fn: () => Promise<T>): Promise<{ value: T; t: Timed }> {
  const start = performance.now();
  const value = await fn();
  return { value, t: { totalMs: performance.now() - start, nativeMs: value.nativeMs } };
}

function split(samples: Timed[]): { total: LatencySummary; native: LatencySummary } {
  return { total: summarize(samples.map((s) => s.totalMs)), native: summarize(samples.map((s) => s.nativeMs)) };
}

function gate(value: number | null, limit: number): { value: number | null; gate: number; pass: boolean | null } {
  return { value, gate: limit, pass: value === null ? null : value < limit };
}

export async function runBench(log: (line: string) => void): Promise<BenchReport> {
  const { archives, model, models, cpu } = useContent.getState();
  if (archives.length === 0) throw new Error('No ZIM archive open');

  const [device, cpuInfo, snapshotBefore, runtime] = await Promise.all([
    ExpoZim.getDeviceInfo(),
    ExpoZim.getCpuInfo(),
    ExpoZim.getDeviceSnapshot(),
    ExpoZim.getRuntimeInfo(),
  ]);
  log(`device ${device.manufacturer} ${device.model} (${device.soc}), cores ${cpuInfo.cores}/${cpuInfo.performanceCores} perf`);
  log(`ICU data: ${runtime.icuDataDir ?? 'none'}`);

  // Warm-up (first Xapian open is not representative of steady state).
  await ExpoZim.suggest('Α', 5, null);
  await ExpoZim.search('Ελλάδα', 8, null, false);

  const suggest: Timed[] = [];
  const suggestCounts: number[] = [];
  for (const q of SUGGEST_QUERIES) {
    const { value, t } = await timed(() => ExpoZim.suggest(q, 10, null));
    suggest.push(t);
    suggestCounts.push(value.hits.length);
  }
  log(`suggest p95 ${summarize(suggest.map((s) => s.totalMs)).p95.toFixed(1)} ms`);

  const fulltext: Timed[] = [];
  const fulltextCounts: number[] = [];
  const topHits: { archiveId: string; path: string }[] = [];
  for (const q of FULLTEXT_QUERIES) {
    const { value, t } = await timed(() => ExpoZim.search(q, 8, null, false));
    fulltext.push(t);
    fulltextCounts.push(value.hits.length);
    const first = value.hits[0];
    if (first) topHits.push({ archiveId: first.archiveId, path: first.path });
  }
  log(`full-text p95 ${summarize(fulltext.map((s) => s.totalMs)).p95.toFixed(1)} ms`);

  const accentProbe: BenchReport['accentProbe'] = [];
  for (const q of ACCENT_PROBE) {
    const sg = await ExpoZim.suggest(q, 3, null);
    const ft = await ExpoZim.search(q, 3, null, false);
    accentProbe.push({
      query: q,
      suggest: sg.hits.map((h) => h.path),
      fulltext: ft.hits.map((h) => h.path),
      fulltextEstimated: ft.estimatedMatches ?? 0,
    });
  }

  const html: Timed[] = [];
  const htmlBytes: number[] = [];
  const text: Timed[] = [];
  const sectionCounts: number[] = [];
  const sampleChunks: string[] = [];
  for (const hit of topHits.slice(0, 10)) {
    const a = await timed(() => ExpoZim.getArticleHtml(hit.archiveId, hit.path));
    html.push(a.t);
    htmlBytes.push(a.value.html.length);
    const p = await timed(() => ExpoZim.getPlainText(hit.archiveId, hit.path));
    if (!p.value.cached) text.push(p.t);
    sectionCounts.push(p.value.sections.length);
    const firstChunk = chunkArticle(p.value)[0];
    if (firstChunk) sampleChunks.push(firstChunk.text);
  }
  if (html.length === 0) throw new Error('Full-text returned no hits; cannot bench article open');
  log(`article html p95 ${summarize(html.map((s) => s.totalMs)).p95.toFixed(1)} ms`);

  let modelReport: BenchReport['model'] = null;
  const prefillSweep: PrefillSample[] = [];
  if (model) {
    // Prefill (time to first token) dominates on CPU: measure thread/affinity/flash-attn variants
    // on the real RAG prompt and keep the fastest for the end-to-end run.
    const ragSources = await runRag(BENCH_RAG_QUESTION, { knowledge, inference: null }, { signal: new AbortController().signal });
    const messages = buildPrompt(BENCH_RAG_QUESTION, ragSources.sources, detectLanguage(BENCH_RAG_QUESTION), 'json');
    const base = loadOptions(cpu ?? cpuInfo);
    const byFreq = cpuInfo.maxFreqKhz.map((f, id) => ({ f, id })).sort((a, b) => b.f - a.f).map((x) => x.id);
    const variants: { label: string; opts: LoadOptions }[] = [
      { label: 'perf-cores pinned', opts: base },
      { label: 'perf-cores unpinned', opts: { ...base, cpuAffinity: [] } },
      { label: 'top-4 pinned', opts: { ...base, threads: 4, cpuAffinity: byFreq.slice(0, 4) } },
      { label: 'perf-cores pinned + flash-attn', opts: { ...base, flashAttention: true } },
      { label: 'all cores unpinned', opts: { ...base, threads: cpuInfo.cores, cpuAffinity: [] } },
    ];
    let best: { opts: LoadOptions; ttft: number } | null = null;
    // Full sweep on the default model, best-known config on every other GGUF (quantisation compare).
    const runs = [
      ...variants.map((v) => ({ m: model, v })),
      ...models.filter((m) => m.id !== model.id).flatMap((m) => [variants[0], variants[1]].flatMap((v) => (v ? [{ m, v }] : []))),
    ];
    for (const { m, v } of runs) {
      await llama.unload();
      const loaded = await llama.load(m, v.opts);
      const r = await llama.generate({ messages, maxTokens: 4, temperature: 0 }, () => undefined, new AbortController().signal);
      const ttft = r.timeToFirstTokenMs ?? Number.POSITIVE_INFINITY;
      prefillSweep.push({
        model: m.id,
        label: v.label,
        threads: v.opts.threads,
        affinity: v.opts.cpuAffinity && v.opts.cpuAffinity.length > 0 ? [...v.opts.cpuAffinity] : null,
        flashAttention: v.opts.flashAttention ?? null,
        loadMs: loaded.loadMs,
        promptTokens: r.promptTokens,
        ttftMs: r.timeToFirstTokenMs,
        promptTokensPerSecond: r.timeToFirstTokenMs ? (r.promptTokens / r.timeToFirstTokenMs) * 1000 : 0,
      });
      log(`prefill ${m.id} ${v.label}: ttft ${r.timeToFirstTokenMs ?? '–'} ms (${r.promptTokens} tok)`);
      if (m.id === model.id && (!best || ttft < best.ttft)) best = { opts: v.opts, ttft };
    }

    await llama.unload();
    const opts = best?.opts ?? base;
    const loaded = await llama.load(model, opts);
    log(`model load ${loaded.loadMs} ms (${opts.threads} threads)`);

    let estimated = 0;
    let actual = 0;
    const tokenizer = llama.tokenizer;
    if (tokenizer) {
      for (const chunk of sampleChunks) {
        estimated += estimateTokens(chunk);
        actual += (await tokenizer.tokenize(chunk)).tokens.length;
      }
    }

    const rag = await runRag(BENCH_RAG_QUESTION, { knowledge, inference: llama }, { signal: new AbortController().signal });
    log(`rag ${rag.status}: ttft ${rag.generation?.timeToFirstTokenMs ?? '–'} ms, ${rag.generation?.tokensPerSecond?.toFixed(1) ?? '–'} tok/s`);
    modelReport = {
      id: model.id,
      sizeBytes: model.sizeBytes,
      threads: opts.threads,
      contextSize: T1_CONTEXT,
      loadMs: loaded.loadMs,
      description: loaded.description,
      rag: {
        question: BENCH_RAG_QUESTION,
        status: rag.status,
        sources: rag.sources.length,
        promptTokens: rag.generation?.promptTokens ?? 0,
        generatedTokens: rag.generation?.generatedTokens ?? 0,
        ttftMs: rag.generation?.timeToFirstTokenMs ?? null,
        tokensPerSecond: rag.generation?.tokensPerSecond ?? null,
        cited: rag.answer?.cited ?? [],
        retrievalMs: rag.timings.retrievalMs,
        extractMs: rag.timings.extractMs,
      },
      tokenEstimate: { samples: sampleChunks.length, estimated, actual, ratio: actual > 0 ? estimated / actual : 0 },
    };
  } else {
    log('no GGUF: model metrics skipped');
  }

  const memory = await ExpoZim.getMemoryInfo();
  log(`peak RSS ${memory.peakRssMb} MB`);

  const suggestStats = split(suggest);
  const fulltextStats = split(fulltext);
  const htmlStats = split(html);
  const report: BenchReport = {
    schema: 1,
    createdAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    device,
    cpu: cpuInfo,
    snapshotBefore,
    runtime,
    archives: archives.map((a) => ({
      archiveId: a.archiveId,
      name: a.name,
      title: a.title,
      articleCount: a.articleCount,
      sizeBytes: a.sizeBytes,
      openMs: a.openMs,
      hasFulltextIndex: a.hasFulltextIndex,
    })),
    suggest: { ...suggestStats, results: suggestCounts },
    fulltext: { ...fulltextStats, results: fulltextCounts },
    articleHtml: { ...htmlStats, bytes: htmlBytes },
    plainText: text.length > 0 ? { ...split(text), sections: sectionCounts } : { ...htmlStats, sections: sectionCounts },
    accentProbe,
    prefillSweep,
    model: modelReport,
    memory,
    gates: {
      suggestP95Ms: gate(suggestStats.total.p95, GATES.suggestP95Ms),
      fulltextP95Ms: gate(fulltextStats.total.p95, GATES.fulltextP95Ms),
      articleHtmlP95Ms: gate(htmlStats.total.p95, GATES.articleOpenMs),
      modelLoadMs: gate(modelReport?.loadMs ?? null, GATES.modelLoadMs),
      ttftMs: gate(modelReport?.rag.ttftMs ?? null, GATES.ttftMs),
    },
    reportPath: null,
  };
  const json = JSON.stringify(report, null, 2);
  const stamp = report.createdAt.replace(/[:.]/g, '-');
  await ExpoZim.writeContentFile(`bench/bench-${stamp}.json`, json);
  report.reportPath = await ExpoZim.writeContentFile('bench/latest.json', json);
  log(`written ${report.reportPath}`);
  return report;
}
