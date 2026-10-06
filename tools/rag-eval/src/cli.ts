import {
  makeTokenEstimator,
  MIN_BIGRAM_SUPPORT,
  parseStructuredAnswer,
  PROMPT_VERSION,
  retrieve,
  summarise,
  tokenizerProfile,
  type BudgetTier,
  type Lang,
  type RagConfig,
} from '@skepi/core';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { NodeLlamaEngine } from './llamaEngine';
import {
  checkThresholds,
  computeSetMetrics,
  GATED_LANGUAGES,
  gatedOutcomes,
  heldoutFindings,
  sweepSupport,
  type ItemOutcome,
  type SetMetrics,
  type Thresholds,
  type TokensPerLang,
} from './metrics';
import { renderMarkdown } from './report';
import { loadSet, sameArticle, type EvalItem, type EvalSet } from './sets';
import { SidecarZimEngine, type SidecarArchive } from './zimEngine';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(ROOT, '..', '..');
const SET_NAMES = ['en', 'el', 'adversarial', 'adversarial-heldout'] as const;
/** Held-out items run against the packs + eval-heldout.zim; every other set never sees that archive. */
const HELDOUT_SET = 'adversarial-heldout';
const HELDOUT_ZIM = 'eval-heldout.zim';

interface Lock {
  zim: Record<string, { file: string; lang: string }>;
  zimDefault: string[];
  /** Frozen-locale packs (Greek), used only with --greek. */
  zimLocale: string[];
  model: { file: string };
  evalTinyModel: { file: string };
}

// `pnpm run eval -- --flag` forwards the separator itself; drop it so the flags parse.
const argv = process.argv.slice(2);
const { values: args } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    smoke: { type: 'boolean', default: false },
    sets: { type: 'string' },
    zim: { type: 'string', multiple: true },
    model: { type: 'string' },
    'no-model': { type: 'boolean', default: false },
    threads: { type: 'string' },
    tier: { type: 'string', default: 'T2' },
    limit: { type: 'string' },
    out: { type: 'string' },
    'check-sets': { type: 'boolean', default: false },
    python: { type: 'string' },
    'min-coverage': { type: 'string' },
    // English-only until v1: Greek items and packs run only on request, reported and never gated.
    greek: { type: 'boolean', default: false },
  },
});

function cacheDir(): string {
  return process.env.SKEPI_CACHE_DIR ?? join(process.env.TEMP ?? tmpdir(), 'skepi', 'cache');
}

function requireFile(path: string, hint: string): string {
  if (!existsSync(path)) throw new Error(`missing ${path} (${hint})`);
  return path;
}

async function main(): Promise<number> {
  const lock = JSON.parse(await readFile(join(REPO, 'scripts', 'content.lock.json'), 'utf8')) as Lock;
  const thresholdsFile = JSON.parse(await readFile(join(ROOT, 'thresholds.json'), 'utf8')) as Record<'full' | 'smoke', Thresholds>;
  const mode = args.smoke ? 'smoke' : 'full';
  const thresholds = thresholdsFile[mode];

  const fixtures = join(ROOT, 'fixtures');
  const zims =
    args.zim ??
    (args.smoke
      ? ['eval-smoke-en.zim', ...(args.greek ? ['eval-smoke-el.zim'] : []), 'eval-synthetic.zim', HELDOUT_ZIM].map((f) =>
          requireFile(join(fixtures, f), 'run scripts/build_eval_zims.py'),
        )
      : [
          ...[...lock.zimDefault, ...(args.greek ? lock.zimLocale : [])].map((id) =>
            requireFile(join(cacheDir(), lock.zim[id]?.file ?? id), 'run scripts/provision.ps1 -DownloadOnly'),
          ),
          requireFile(join(fixtures, 'eval-synthetic.zim'), 'run scripts/build_eval_zims.py'),
          requireFile(join(fixtures, HELDOUT_ZIM), 'run scripts/build_eval_zims.py'),
        ]);
  const modelPath = args['no-model']
    ? null
    : (args.model ?? process.env.SKEPI_EVAL_MODEL ?? join(cacheDir(), args.smoke ? lock.evalTinyModel.file : lock.model.file));
  if (modelPath) requireFile(modelPath, 'download it with scripts/provision.ps1 -DownloadOnly or set SKEPI_EVAL_MODEL');

  const sets: EvalSet[] = [];
  for (const name of SET_NAMES) sets.push(await loadSet(join(ROOT, 'sets', `${name}.json`)));
  const wanted = new Set((args.sets ?? SET_NAMES.join(',')).split(',').map((s) => s.trim()));
  let smokeIds: Set<string> | null = null;
  let smokeSets = new Set<string>();
  if (args.smoke) {
    const smoke = JSON.parse(await readFile(join(ROOT, 'sets', 'smoke.json'), 'utf8')) as { ids: string[]; sets?: string[] };
    smokeIds = new Set(smoke.ids);
    smokeSets = new Set(smoke.sets ?? []);
  }
  const items: { set: string; item: EvalItem }[] = sets
    .filter((s) => wanted.has(s.name))
    .flatMap((s) => s.items.map((item) => ({ set: s.name, item })))
    .filter(({ set, item }) => smokeIds === null || smokeIds.has(item.id) || smokeSets.has(set));
  if (smokeIds) {
    const found = new Set(items.map((i) => i.item.id));
    const missing = [...smokeIds].filter((id) => !found.has(id));
    if (missing.length > 0) throw new Error(`smoke.json references unknown ids: ${missing.join(', ')}`);
  }
  const inScope = items.filter(({ item }) => args.greek || GATED_LANGUAGES.has(item.lang));
  const limited = args.limit ? inScope.slice(0, Number(args.limit)) : inScope;

  const knowledge = new SidecarZimEngine(args.python ?? process.env.SKEPI_PYTHON ?? 'python');
  try {
    const archives: (SidecarArchive & { file: string })[] = [];
    for (const z of zims) archives.push({ ...(await knowledge.open(z)), file: basename(z) });
    console.log(`archives: ${archives.map((a) => `${a.file} (${a.language}, ${a.articleCount})`).join(', ')}`);
    const refs = archives.map((a) => ({ archiveId: a.archiveId, language: a.language }));
    // Held-out items see the packs + eval-heldout.zim; the other sets never see that archive, so adding
    // the held-out set changes nothing in their results.
    const withoutFile = (file: string): string[] => archives.filter((a) => a.file !== file).map((a) => a.archiveId);
    const scope = (set: string): string[] => (set === HELDOUT_SET ? withoutFile('eval-synthetic.zim') : withoutFile(HELDOUT_ZIM));

    if (args['check-sets']) return await checkSets(knowledge, archives.map((a) => a.archiveId), limited);

    const threads = Number(args.threads ?? Math.min(8, availableParallelism()));
    const tier = args.tier as BudgetTier;
    const modelId = modelPath ? basename(modelPath).toLowerCase() : null;
    const config: Partial<RagConfig> = {
      tier,
      modelId,
      contextSize: 2048,
      ...(args['min-coverage'] ? { minCoverage: Number(args['min-coverage']) } : {}),
    };
    const inference = modelPath ? new NodeLlamaEngine() : null;
    if (inference && modelPath && modelId) {
      const loaded = await inference.load(
        { id: modelId, path: modelPath, sizeBytes: 0 },
        { contextSize: 2048, threads, useMmap: true, useMlock: false, gpuLayers: 0 },
      );
      console.log(`model ${loaded.description}, load ${loaded.loadMs} ms`);
    }

    const outcomes: ItemOutcome[] = [];
    for (const [i, { set, item }] of limited.entries()) {
      const signal = new AbortController().signal;
      const r = await retrieve(item.question, knowledge, { signal, config, archives: refs, archiveIds: scope(set) });
      const outcome: ItemOutcome = {
        set,
        item,
        retrieval: r.status,
        noSourceReason: r.noSourceReason,
        best: r.best,
        sources: r.sources.map((s) => ({ id: s.id, title: s.title, heading: s.heading, path: s.path, text: s.text })),
        summary: null,
        timing: { layer1Ms: r.timings.layer1Ms, ttftMs: null, generateMs: null, promptTokens: null, generatedTokens: null, tokensPerSecond: null },
      };
      if (inference && r.status === 'ready') {
        const s = await summarise(r, inference, { signal, config });
        outcome.summary = {
          status: s.status,
          hiddenReason: s.hiddenReason,
          covered: parseStructuredAnswer(s.generation.text)?.covered ?? null,
          raw: s.generation.text,
          stopReason: s.generation.stopReason,
          sentences: (s.validation?.sentences ?? []).map((x) => ({ text: x.text, source: x.source, kept: x.kept, reason: x.reason, support: x.support })),
        };
        outcome.timing = {
          ...outcome.timing,
          ttftMs: s.generation.timeToFirstTokenMs,
          generateMs: s.generateMs,
          promptTokens: s.generation.promptTokens,
          generatedTokens: s.generation.generatedTokens,
          tokensPerSecond: s.generation.tokensPerSecond,
        };
      }
      outcomes.push(outcome);
      const shown = outcome.summary?.status === 'shown' ? outcome.summary.sentences.filter((x) => x.kept).length : 0;
      console.log(
        `[${i + 1}/${limited.length}] ${item.id} ${r.status}${r.noSourceReason ? `:${r.noSourceReason}` : ''} ` +
          `sources=${r.sources.length} summary=${outcome.summary?.status ?? '-'} shown=${shown}/${outcome.summary?.sentences.length ?? 0} ` +
          `ttft=${outcome.timing.ttftMs ?? '-'}ms`,
      );
    }

    const tokens: TokensPerLang = { en: null, el: null };
    if (inference && modelId) {
      const estimate = makeTokenEstimator(tokenizerProfile(modelId));
      for (const lang of args.greek ? (['en', 'el'] as const) : (['en'] as const)) {
        const texts = [...new Set(outcomes.filter((o) => o.item.lang === lang).flatMap((o) => o.sources.map((s) => s.text)))];
        const chars = texts.reduce((n, t) => n + t.length, 0);
        if (chars === 0) continue;
        const actual = texts.reduce((n, t) => n + inference.tokenize(t), 0);
        const estimated = texts.reduce((n, t) => n + estimate(t), 0);
        tokens[lang] = { chars, tokens: actual, tokensPerChar: actual / chars, estimated, estimateRatio: estimated / actual };
      }
    }

    // Pooled metrics, per-set rows and the sweep cover the gated (English) items only; the held-out set
    // is reported in its own section and never gated; Greek (--greek) is a per-language row only.
    const gated = gatedOutcomes(outcomes);
    const heldout = outcomes.filter((o) => o.set === HELDOUT_SET);
    const perSet: Record<string, SetMetrics> = {};
    for (const name of new Set(gated.map((o) => o.set))) perSet[name] = computeSetMetrics(gated.filter((o) => o.set === name));
    const perLang: Partial<Record<Lang, SetMetrics>> = {};
    for (const lang of ['en', 'el'] as const) {
      const subset = outcomes.filter((o) => o.set !== HELDOUT_SET && o.item.lang === lang);
      if (subset.length > 0) perLang[lang] = computeSetMetrics(subset);
    }
    const checks = inference ? checkThresholds(outcomes, thresholds) : [];
    const sweep = sweepSupport(gated, [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    const heldoutReport =
      heldout.length > 0
        ? {
            metrics: computeSetMetrics(heldout),
            findings: heldoutFindings(heldout),
            items: heldout.length,
            status: sets.find((s) => s.name === HELDOUT_SET)?.status ?? null,
          }
        : null;
    const report = {
      schema: 1,
      createdAt: new Date().toISOString(),
      mode,
      greek: args.greek,
      promptVersion: PROMPT_VERSION,
      minBigramSupport: MIN_BIGRAM_SUPPORT,
      model: modelId,
      threads,
      tier,
      archives,
      thresholds,
      checks,
      all: computeSetMetrics(gated),
      heldout: heldoutReport,
      perSet,
      perLang,
      tokens,
      sweep,
      outcomes,
    };
    const outDir = args.out ? resolve(args.out) : join(ROOT, 'out');
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, `rag-eval-${mode}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const md = renderMarkdown(report);
    await writeFile(join(outDir, `rag-eval-${mode}.md`), md);
    console.log(md);
    await inference?.unload();
    const failed = checks.filter((c) => c.gated && !c.pass);
    if (failed.length > 0) {
      console.error(`THRESHOLDS MISSED: ${failed.map((c) => `${c.name}=${String(c.value)} (need ${c.threshold})`).join(', ')}`);
      return 1;
    }
    console.log(inference ? 'RAG-EVAL PASS' : 'RAG-EVAL (Layer 1 only, no thresholds)');
    return 0;
  } finally {
    knowledge.close();
  }
}

/** Dataset hygiene: every expected article must exist in one of the open archives. */
async function checkSets(knowledge: SidecarZimEngine, archiveIds: string[], items: { set: string; item: EvalItem }[]): Promise<number> {
  let missing = 0;
  for (const { set, item } of items) {
    for (const title of item.articles) {
      // A title may be a redirect in one pack (the English pack redirects "Αθήνα" to "Athens") and a
      // real article in another: it counts when any pack has it as an article.
      const redirects: string[] = [];
      let ok = false;
      for (const archiveId of archiveIds) {
        const found = await knowledge.exists(archiveId, title.replace(/ /g, '_'));
        if (found && sameArticle(found.title, title)) {
          ok = true;
          break;
        }
        if (found) redirects.push(found.title);
      }
      if (!ok) {
        missing += 1;
        console.log(`MISSING ${set}/${item.id}: "${title}"${redirects.length > 0 ? ` (redirects to "${redirects.join('", "')}")` : ''}`);
      }
    }
  }
  console.log(missing === 0 ? 'all expected articles exist' : `${missing} expected articles missing or redirected`);
  return missing === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 2;
  },
);
