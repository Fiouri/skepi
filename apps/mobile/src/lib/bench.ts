import {
  DEFAULT_SUGGEST,
  makeTokenEstimator,
  PROMPT_VERSION,
  resolveInferenceProfile,
  retrieve,
  summarise,
  suggestTitles,
  summarize,
  tokenizerProfile,
  type InferenceBackend,
  type Lang,
  type LatencySummary,
  type ProfileMode,
  type RagSource,
  type SummaryMode,
  type Tier,
} from '@skepi/core';
import { ExpoDeviceProfile, type CpuInfo, type DeviceInfo, type MemoryInfo } from 'expo-device-profile';
import { ExpoZim, type ZimArchiveInfo } from 'expo-zim';
import { ensureModel, knowledge, llama, ragArchives, ragConfigFor, useContent } from './content';

/** Title prefixes typed into the suggestion box (English primary, Greek secondary). */
export const SUGGEST_QUERIES = [
  'Lond', 'Wat', 'Earth', 'Phot', 'Shak', 'Mount', 'Elec', 'Vacc', 'Rome', 'Gree',
  'Αθ', 'Πάτ', 'Ελλ', 'Θεσ', 'Κρή', 'σεισ', 'νερ', 'Όλυμ', 'Αριστ', 'Βυζ',
];

/** Full-text queries (single and multi-term), English and Greek. */
export const FULLTEXT_QUERIES = [
  'water purification', 'earthquake', 'photosynthesis', 'World War II', 'Mount Everest', 'electricity',
  'vaccine', 'Roman Empire', 'Greece', 'heart blood',
  'Πάτρα', 'Αθήνα', 'σεισμός', 'νερό', 'πυρκαγιά', 'Όλυμπος', 'δημοκρατία', 'Αριστοτέλης', 'Αχαΐα', 'Ευρωπαϊκή Ένωση',
];

/** Same words in different case/accent forms: shows whether ICU data changes matching. */
export const ACCENT_PROBE = ['Πάτρα', 'πατρα', 'ΠΑΤΡΑ', 'σεισμός', 'σεισμος', 'ΣΕΙΣΜΟΣ', 'Αχαΐα', 'αχαια'];

/** Ask questions per language: all measure Layer 1 and sources visible; the first TTFT_SAMPLES also run the AI summary. */
export const BENCH_QUESTIONS: Record<Lang, readonly string[]> = {
  en: [
    'How long should water be boiled to make it safe to drink?',
    'What is the capital of Australia?',
    'Who wrote Romeo and Juliet?',
    'What causes earthquakes?',
    'How does photosynthesis work?',
    'When did World War II end?',
    'How tall is Mount Everest?',
    'What is the speed of light?',
    'What is the population of Greece?',
    'Where is the Great Barrier Reef?',
  ],
  el: [
    'Πού βρίσκεται η Πάτρα και πόσους κατοίκους έχει;',
    'Ποια είναι η πρωτεύουσα της Ελλάδας;',
    'Πότε ξεκίνησε η Ελληνική Επανάσταση;',
    'Τι προκαλεί τους σεισμούς;',
    'Ποιος ήταν ο Αριστοτέλης;',
    'Πόσο ψηλός είναι ο Όλυμπος;',
    'Τι είναι η δημοκρατία;',
    'Πού βρίσκεται η Κρήτη;',
    'Ποιος έγραψε την Οδύσσεια;',
    'Πότε ιδρύθηκε η Θεσσαλονίκη;',
  ],
};
export const TTFT_SAMPLES = 6;

export const GATES = {
  suggestP95Ms: 50,
  fulltextP95Ms: 300,
  articleOpenMs: 500,
  modelLoadMs: 10_000,
  /** Layer 1 and sources visible: T1 targets, gated in T1-simulation mode. */
  layer1P95Ms: 1_000,
  sourcesVisibleP95Ms: 2_000,
  /** First AI token on T2 with English content (Phase 1b acceptance). */
  ttftT2P95Ms: 15_000,
} as const;

export interface BenchOptions {
  /** Force the T1 profile (T1 model, 2 threads, n_ctx 2048, T1 budget) on any device. */
  simulateT1: boolean;
  backend: InferenceBackend;
  /** Renders the sources in the bench screen and resolves with the time of the first frame that shows them. */
  renderSources: (sources: RagSource[]) => Promise<number>;
}

interface Timed {
  totalMs: number;
  nativeMs: number;
}

export interface AskSample {
  lang: Lang;
  question: string;
  status: string;
  sources: number;
  sourceChars: number;
  layer1Ms: number;
  sourcesVisibleMs: number | null;
  retrievalMs: number;
  extractMs: number;
  rankMs: number;
  summary: null | {
    status: string;
    hiddenReason: string | null;
    promptTokens: number;
    cachedPromptTokens: number;
    generatedTokens: number;
    ttftMs: number | null;
    tokensPerSecond: number | null;
    totalMs: number;
    kept: number;
    written: number;
    cited: string[];
  };
}

export interface LangSummary {
  layer1: LatencySummary | null;
  sourcesVisible: LatencySummary | null;
  ttft: LatencySummary | null;
  tokensPerSecond: LatencySummary | null;
  promptTokens: LatencySummary | null;
}

export interface BenchReport {
  schema: 4;
  createdAt: string;
  promptVersion: string;
  /** 't1-simulation' when the T1 profile was forced on this device. */
  mode: ProfileMode;
  profile: {
    detectedTier: Tier;
    effectiveTier: Tier;
    budgetTier: string;
    summaryMode: SummaryMode;
    backend: InferenceBackend;
    modelId: string | null;
    threads: number;
    cpuAffinity: number[] | null;
    contextSize: number;
    gpuLayers: number;
  };
  device: DeviceInfo;
  cpu: CpuInfo;
  snapshotBefore: Awaited<ReturnType<typeof ExpoDeviceProfile.getSnapshot>>;
  runtime: Awaited<ReturnType<typeof ExpoZim.getRuntimeInfo>>;
  archives: Pick<ZimArchiveInfo, 'archiveId' | 'name' | 'title' | 'language' | 'articleCount' | 'sizeBytes' | 'openMs' | 'hasFulltextIndex'>[];
  suggest: { total: LatencySummary; native: LatencySummary; results: number[] };
  fulltext: { total: LatencySummary; native: LatencySummary; results: number[] };
  articleHtml: { total: LatencySummary; native: LatencySummary; bytes: number[] };
  accentProbe: { query: string; suggest: string[]; fulltext: string[]; fulltextEstimated: number }[];
  model: null | {
    id: string;
    sizeBytes: number;
    /** First load in this bench run (cold when the file is not in the page cache, e.g. after a reboot). */
    loadMs: number;
    /** Second load right after unloading: the file is in the page cache (the < 10 s target). */
    warmLoadMs: number;
    prewarmMs: number;
    description: string;
    gpu: boolean;
    devices: string[];
    reasonNoGpu: string;
  };
  ask: AskSample[];
  perLang: Record<Lang, LangSummary>;
  /** Real tokenizer vs the core estimator, over the retrieved source passages. */
  tokenizer: Record<Lang, { chars: number; actual: number; estimated: number; actualPerChar: number; profilePerChar: number; ratio: number }> | null;
  memory: MemoryInfo;
  gates: Record<string, { value: number | null; gate: number | null; pass: boolean | null }>;
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

function maybe(samples: readonly (number | null)[]): LatencySummary | null {
  const values = samples.filter((v): v is number => v !== null && Number.isFinite(v));
  return values.length > 0 ? summarize(values) : null;
}

function gate(value: number | null | undefined, limit: number | null): { value: number | null; gate: number | null; pass: boolean | null } {
  const v = value ?? null;
  return { value: v, gate: limit, pass: v === null || limit === null ? null : v < limit };
}

export async function runBench(log: (line: string) => void, options: BenchOptions): Promise<BenchReport> {
  const { archives, models } = useContent.getState();
  if (archives.length === 0) throw new Error('No ZIM archive open');

  const [device, cpuInfo, snapshotBefore, runtime] = await Promise.all([
    ExpoDeviceProfile.getDeviceInfo(),
    ExpoDeviceProfile.getCpuInfo(),
    ExpoDeviceProfile.getSnapshot(),
    ExpoZim.getRuntimeInfo(),
  ]);
  const profile = resolveInferenceProfile({
    totalRamMb: snapshotBefore.totalRamMb,
    cpu: cpuInfo,
    models,
    simulateT1: options.simulateT1,
    backend: options.backend,
  });
  const model = models.find((m) => m.id === profile.modelId) ?? null;
  const ragConfig = ragConfigFor(profile);
  log(`device ${device.manufacturer} ${device.model} (${device.soc}), cores ${cpuInfo.cores}/${cpuInfo.performanceCores} perf`);
  log(
    `mode ${profile.mode}: tier ${profile.detectedTier} -> ${profile.effectiveTier}, model ${profile.modelId ?? 'none'}, ` +
      `${profile.load.threads} threads, n_ctx ${profile.load.contextSize}, budget ${profile.budgetTier}, backend ${profile.backend}`,
  );
  log(`archives: ${archives.map((a) => `${a.name} (${a.language})`).join(', ')}`);

  // Warm-up (first Xapian open is not representative of steady state).
  const suggestScope = { ...DEFAULT_SUGGEST, archives: ragArchives() };
  await suggestTitles(knowledge, 'A', suggestScope);
  await ExpoZim.search('water', 8, null, false);
  await ExpoZim.search('Ελλάδα', 8, null, false);

  const suggest: Timed[] = [];
  const suggestCounts: number[] = [];
  // As typed in the Search screen: active-language packs first, packs in parallel, capped per pack.
  for (const q of SUGGEST_QUERIES) {
    const start = performance.now();
    const hits = await suggestTitles(knowledge, q, suggestScope);
    suggest.push({ totalMs: performance.now() - start, nativeMs: knowledge.lastNativeMs.suggest });
    suggestCounts.push(hits.length);
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
    accentProbe.push({ query: q, suggest: sg.hits.map((h) => h.path), fulltext: ft.hits.map((h) => h.path), fulltextEstimated: ft.estimatedMatches ?? 0 });
  }

  const html: Timed[] = [];
  const htmlBytes: number[] = [];
  for (const hit of topHits.slice(0, 10)) {
    const a = await timed(() => ExpoZim.getArticleHtml(hit.archiveId, hit.path));
    html.push(a.t);
    htmlBytes.push(a.value.html.length);
  }
  if (html.length === 0) throw new Error('Full-text returned no hits; cannot bench article open');
  log(`article html p95 ${summarize(html.map((s) => s.totalMs)).p95.toFixed(1)} ms`);

  // Layer 1 + sources visible for every question; the AI summary for the first TTFT_SAMPLES.
  let modelReport: BenchReport['model'] = null;
  if (model) {
    await llama.unload();
    const first = await ensureModel({ profile, model });
    await llama.unload();
    const ready = first ? await ensureModel({ profile, model }) : null;
    if (first && ready) {
      modelReport = {
        id: model.id,
        sizeBytes: model.sizeBytes,
        loadMs: first.loaded.loadMs,
        warmLoadMs: ready.loaded.loadMs,
        prewarmMs: ready.prewarmMs,
        description: ready.loaded.description,
        gpu: ready.loaded.gpu,
        devices: ready.loaded.devices,
        reasonNoGpu: ready.loaded.reasonNoGpu,
      };
      log(
        `model load ${first.loaded.loadMs} ms (first), ${ready.loaded.loadMs} ms (warm), prewarm ${ready.prewarmMs} ms, ` +
          `gpu ${String(ready.loaded.gpu)} ${ready.loaded.reasonNoGpu}`,
      );
    }
  } else {
    log('no GGUF: AI summary metrics skipped');
  }

  const ask: AskSample[] = [];
  const passages: Record<Lang, string[]> = { en: [], el: [] };
  for (const lang of ['en', 'el'] as const) {
    for (const [i, question] of BENCH_QUESTIONS[lang].entries()) {
      const signal = new AbortController().signal;
      const start = performance.now();
      // Set from the event callback; an object so the assignment is visible to control-flow analysis.
      const shown: { at: Promise<number> | null } = { at: null };
      const r = await retrieve(question, knowledge, {
        signal,
        config: ragConfig,
        archives: ragArchives(),
        onEvent: (e) => {
          if (e.type === 'context') shown.at = options.renderSources(e.sources);
        },
      });
      const shownAt = shown.at === null ? null : await shown.at;
      for (const s of r.sources) passages[lang].push(s.text);
      const sample: AskSample = {
        lang,
        question,
        status: r.status,
        sources: r.sources.length,
        sourceChars: r.sources.reduce((n, s) => n + s.text.length, 0),
        layer1Ms: r.timings.layer1Ms,
        sourcesVisibleMs: shownAt === null ? null : shownAt - start,
        retrievalMs: r.timings.retrievalMs,
        extractMs: r.timings.extractMs,
        rankMs: r.timings.rankMs,
        summary: null,
      };
      if (modelReport && r.status === 'ready' && i < TTFT_SAMPLES) {
        const s = await summarise(r, llama, { signal, config: ragConfig });
        sample.summary = {
          status: s.status,
          hiddenReason: s.hiddenReason,
          promptTokens: s.generation.promptTokens,
          cachedPromptTokens: s.generation.cachedPromptTokens,
          generatedTokens: s.generation.generatedTokens,
          ttftMs: s.generation.timeToFirstTokenMs,
          tokensPerSecond: s.generation.tokensPerSecond,
          totalMs: s.generateMs,
          kept: s.validation?.kept.length ?? 0,
          written: s.validation?.sentences.length ?? 0,
          cited: s.validation?.cited ?? [],
        };
      }
      ask.push(sample);
      log(
        `${lang} q${i + 1} ${r.status}: layer1 ${r.timings.layer1Ms} ms, visible ${sample.sourcesVisibleMs?.toFixed(0) ?? '–'} ms` +
          (sample.summary
            ? `, ttft ${sample.summary.ttftMs ?? '–'} ms (${sample.summary.promptTokens} tok, ${sample.summary.cachedPromptTokens} cached), ` +
              `${sample.summary.tokensPerSecond?.toFixed(1) ?? '–'} tok/s, ${sample.summary.status} ${sample.summary.kept}/${sample.summary.written}`
            : ''),
      );
    }
  }
  await options.renderSources([]);

  const perLang = Object.fromEntries(
    (['en', 'el'] as const).map((lang) => {
      const samples = ask.filter((a) => a.lang === lang);
      const withSummary = samples.flatMap((a) => (a.summary ? [a.summary] : []));
      return [
        lang,
        {
          layer1: maybe(samples.map((a) => a.layer1Ms)),
          sourcesVisible: maybe(samples.map((a) => a.sourcesVisibleMs)),
          ttft: maybe(withSummary.map((s) => s.ttftMs)),
          tokensPerSecond: maybe(withSummary.map((s) => s.tokensPerSecond)),
          promptTokens: maybe(withSummary.map((s) => s.promptTokens)),
        },
      ];
    }),
  ) as Record<Lang, LangSummary>;

  let tokenizer: BenchReport['tokenizer'] = null;
  const ctx = llama.tokenizer;
  if (ctx) {
    const profileTok = tokenizerProfile(profile.modelId);
    const estimate = makeTokenEstimator(profileTok);
    const out: NonNullable<BenchReport['tokenizer']> = {
      en: { chars: 0, actual: 0, estimated: 0, actualPerChar: 0, profilePerChar: profileTok.tokensPerChar.en, ratio: 0 },
      el: { chars: 0, actual: 0, estimated: 0, actualPerChar: 0, profilePerChar: profileTok.tokensPerChar.el, ratio: 0 },
    };
    for (const lang of ['en', 'el'] as const) {
      const row = out[lang];
      for (const text of new Set(passages[lang])) {
        row.chars += text.length;
        row.estimated += estimate(text);
        row.actual += (await ctx.tokenize(text)).tokens.length;
      }
      row.actualPerChar = row.chars > 0 ? row.actual / row.chars : 0;
      row.ratio = row.actual > 0 ? row.estimated / row.actual : 0;
      log(`tokenizer ${lang}: ${row.actualPerChar.toFixed(3)} tok/char (profile ${row.profilePerChar}), estimate/actual ${row.ratio.toFixed(2)}`);
    }
    tokenizer = out;
  }

  const memory = await ExpoDeviceProfile.getMemoryInfo();
  log(`peak RSS ${memory.peakRssMb} MB`);

  const suggestStats = split(suggest);
  const fulltextStats = split(fulltext);
  const htmlStats = split(html);
  const t1 = profile.mode === 't1-simulation' || profile.effectiveTier === 'T1';
  const t2 = profile.effectiveTier === 'T2' && profile.mode === 'normal';
  const report: BenchReport = {
    schema: 4,
    createdAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    mode: profile.mode,
    profile: {
      detectedTier: profile.detectedTier,
      effectiveTier: profile.effectiveTier,
      budgetTier: profile.budgetTier,
      summaryMode: profile.summaryMode,
      backend: profile.backend,
      modelId: profile.modelId,
      threads: profile.load.threads,
      cpuAffinity: profile.load.cpuAffinity && profile.load.cpuAffinity.length > 0 ? [...profile.load.cpuAffinity] : null,
      contextSize: profile.load.contextSize,
      gpuLayers: profile.load.gpuLayers,
    },
    device,
    cpu: cpuInfo,
    snapshotBefore,
    runtime,
    archives: archives.map((a) => ({
      archiveId: a.archiveId,
      name: a.name,
      title: a.title,
      language: a.language,
      articleCount: a.articleCount,
      sizeBytes: a.sizeBytes,
      openMs: a.openMs,
      hasFulltextIndex: a.hasFulltextIndex,
    })),
    suggest: { ...suggestStats, results: suggestCounts },
    fulltext: { ...fulltextStats, results: fulltextCounts },
    articleHtml: { ...htmlStats, bytes: htmlBytes },
    accentProbe,
    model: modelReport,
    ask,
    perLang,
    tokenizer,
    memory,
    gates: {
      suggestP95Ms: gate(suggestStats.total.p95, GATES.suggestP95Ms),
      fulltextP95Ms: gate(fulltextStats.total.p95, GATES.fulltextP95Ms),
      articleHtmlP95Ms: gate(htmlStats.total.p95, GATES.articleOpenMs),
      modelLoadMs: gate(modelReport?.warmLoadMs, GATES.modelLoadMs),
      modelFirstLoadMs: gate(modelReport?.loadMs, null),
      layer1EnP95Ms: gate(perLang.en.layer1?.p95, t1 ? GATES.layer1P95Ms : null),
      layer1ElP95Ms: gate(perLang.el.layer1?.p95, t1 ? GATES.layer1P95Ms : null),
      sourcesVisibleEnP95Ms: gate(perLang.en.sourcesVisible?.p95, t1 ? GATES.sourcesVisibleP95Ms : null),
      sourcesVisibleElP95Ms: gate(perLang.el.sourcesVisible?.p95, t1 ? GATES.sourcesVisibleP95Ms : null),
      ttftEnP95Ms: gate(perLang.en.ttft?.p95, t2 ? GATES.ttftT2P95Ms : null),
      ttftElP95Ms: gate(perLang.el.ttft?.p95, null),
    },
    reportPath: null,
  };
  const json = JSON.stringify(report, null, 2);
  const stamp = report.createdAt.replace(/[:.]/g, '-');
  await ExpoZim.writeContentFile(`bench/bench-${report.mode}-${profile.backend}-${stamp}.json`, json);
  report.reportPath = await ExpoZim.writeContentFile('bench/latest.json', json);
  log(`written ${report.reportPath}`);
  return report;
}
