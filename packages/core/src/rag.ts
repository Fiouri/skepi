import type { ArticleText, GenerateResult, InferenceEngine, KnowledgeEngine, SearchHit } from '@skepi/contracts';
import { rankBm25 } from './bm25';
import { resolveContextBudget, selectWithinBudget, type BudgetTier, type ContextBudget, type ScoredChunk } from './budget';
import { chunkArticle, type Chunk } from './chunk';
import { detectEmergency, type EmergencyMatch } from './emergency';
import { buildLayer1, type Layer1Answer } from './extractive';
import { reciprocalRankFusion } from './fusion';
import { detectMedicalIntent, type MedicalIntent } from './medical';
import { buildPrompt, PROMPT_VERSION, SYSTEM_PROMPT, type PromptSource } from './prompt';
import {
  ANSWER_MAX_TOKENS,
  answerJsonSchema,
  answerLimits,
  parseStructuredAnswer,
  validateStructured,
  type StructuredValidation,
} from './structured';
import { detectLanguage, extractKeywords, type Lang } from './text';
import { makeTokenEstimator, tokenizerProfile } from './tokens';
import { checkSentence, MIN_BIGRAM_SUPPORT } from './validate';

export interface RagConfig {
  /** Articles kept after fusion (spec: top 8). */
  fulltextTopK: number;
  /** Maximum number of Xapian queries per question (1 conjunctive + per-keyword fallbacks). */
  maxQueries: number;
  /** No-source threshold: the best chunk must contain this fraction of the query terms… */
  minCoverage: number;
  /** …and reach at least this BM25 score. */
  minScore: number;
  /** Tier whose character budget applies (T1 in T1-simulation mode). */
  tier: BudgetTier;
  /** Active model file: selects the measured tokens-per-character for budgets and answer limits. */
  modelId: string | null;
  /** Model context size; the budget is clamped so the whole prompt fits. */
  contextSize: number;
  temperature: number;
  /** Answer limit per language (tokens). */
  answerMaxTokens: Readonly<Record<Lang, number>>;
  minSupport: number;
}

export const DEFAULT_RAG_CONFIG: RagConfig = {
  fulltextTopK: 8,
  maxQueries: 5,
  minCoverage: 0.6,
  minScore: 0.5,
  tier: 'T1',
  modelId: null,
  contextSize: 2048,
  temperature: 0.2,
  answerMaxTokens: ANSWER_MAX_TOKENS,
  minSupport: MIN_BIGRAM_SUPPORT,
};

export interface RagSource extends PromptSource {
  archiveId: string;
  path: string;
  score: number;
  /** Estimated tokens with the active model's tokenizer profile. */
  tokens: number;
}

export type NoSourceReason = 'no_keywords' | 'no_hits' | 'below_threshold';

export type SummaryLabel = 'ai-summary' | 'unverified-ai-summary';

export type RagEvent =
  | { type: 'emergency'; match: EmergencyMatch }
  | { type: 'medical'; intent: MedicalIntent }
  | { type: 'retrieved'; hits: SearchHit[]; ms: number }
  | { type: 'context'; sources: RagSource[]; ms: number }
  | { type: 'layer1'; answer: Layer1Answer; ms: number }
  | { type: 'no_source'; reason: NoSourceReason }
  | { type: 'token'; text: string }
  | { type: 'sentence'; text: string; source: string };

export interface RetrievalTimings {
  retrievalMs: number;
  extractMs: number;
  rankMs: number;
  /** From the start of the question to the Layer 1 answer (includes everything above). */
  layer1Ms: number;
}

export type RetrievalStatus = 'ready' | 'no_source' | 'aborted';

export interface RetrievalResult {
  status: RetrievalStatus;
  question: string;
  promptVersion: string;
  lang: Lang;
  keywords: string[];
  emergency: EmergencyMatch | null;
  medical: MedicalIntent | null;
  hits: SearchHit[];
  sources: RagSource[];
  noSourceReason: NoSourceReason | null;
  best: { score: number; coverage: number } | null;
  budget: ContextBudget | null;
  layer1: Layer1Answer | null;
  timings: RetrievalTimings;
}

export interface RetrieveOptions {
  signal: AbortSignal;
  onEvent?: (event: RagEvent) => void;
  config?: Partial<RagConfig>;
  archiveIds?: readonly string[];
  now?: () => number;
}

/** Reads the live flag: the signal can flip while retrieval is awaited (defeats TS narrowing). */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** Conjunctive query first (libzim uses OP_AND), then single-keyword fallbacks, longest first. */
export function planQueries(keywords: readonly string[], maxQueries: number): string[] {
  if (keywords.length === 0) return [];
  const queries = [keywords.join(' ')];
  if (keywords.length > 1) {
    const singles = [...keywords].sort((a, b) => b.length - a.length);
    for (const k of singles) {
      if (queries.length >= maxQueries) break;
      queries.push(k);
    }
  }
  return queries;
}

async function search(
  knowledge: KnowledgeEngine,
  keywords: readonly string[],
  cfg: RagConfig,
  archiveIds: readonly string[] | undefined,
): Promise<SearchHit[]> {
  const queries = planQueries(keywords, cfg.maxQueries);
  const lists: SearchHit[][] = [];
  for (const q of queries) {
    const hits = await knowledge.search(q, {
      mode: 'fulltext',
      limit: cfg.fulltextTopK,
      ...(archiveIds ? { archiveIds } : {}),
    });
    lists.push(hits);
    // A conjunctive query that already fills top-K needs no fallbacks.
    if (lists.length === 1 && hits.length >= cfg.fulltextTopK) break;
  }
  return reciprocalRankFusion(lists).slice(0, cfg.fulltextTopK);
}

async function extract(knowledge: KnowledgeEngine, hits: readonly SearchHit[]): Promise<ArticleText[]> {
  const settled = await Promise.allSettled(hits.map((h) => knowledge.getPlainText(h.archiveId, h.path)));
  return settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
}

export function rankChunks(keywords: readonly string[], chunks: readonly Chunk[]): ScoredChunk[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return rankBm25(
    keywords,
    chunks.map((c) => ({ id: c.id, text: `${c.articleTitle} ${c.heading} ${c.text}` })),
  ).flatMap((r) => {
    const chunk = byId.get(r.id);
    return chunk ? [{ chunk, score: r.score, coverage: r.coverage }] : [];
  });
}

export function toSources(selected: readonly ScoredChunk[]): RagSource[] {
  return selected.map((s, i) => ({
    id: `S${i + 1}`,
    archiveId: s.chunk.archiveId,
    path: s.chunk.path,
    title: s.chunk.articleTitle,
    heading: s.chunk.heading,
    text: s.chunk.text,
    score: s.score,
    tokens: s.chunk.tokens,
  }));
}

/** Prompt tokens that are not source text: system prompt, chat template, instruction, question, answer. */
function reservedTokens(question: string, lang: Lang, cfg: RagConfig): number {
  const estimate = makeTokenEstimator(tokenizerProfile(cfg.modelId));
  const TEMPLATE_AND_INSTRUCTION = 80;
  return estimate(SYSTEM_PROMPT) + estimate(question) + TEMPLATE_AND_INSTRUCTION + cfg.answerMaxTokens[lang];
}

/**
 * Everything up to Layer 1, without the LLM: emergency and medical checks → full-text retrieval →
 * plain-text sections → chunks → BM25 → character budget → extractive answer. Below the no-source
 * threshold nothing else runs.
 */
export async function retrieve(question: string, knowledge: KnowledgeEngine, options: RetrieveOptions): Promise<RetrievalResult> {
  const cfg: RagConfig = { ...DEFAULT_RAG_CONFIG, ...options.config };
  const now = options.now ?? (() => Date.now());
  const emit = options.onEvent ?? (() => undefined);
  const started = now();
  const timings: RetrievalTimings = { retrievalMs: 0, extractMs: 0, rankMs: 0, layer1Ms: 0 };

  const emergency = detectEmergency(question);
  if (emergency) emit({ type: 'emergency', match: emergency });
  const medical = detectMedicalIntent(question, emergency);
  if (medical) emit({ type: 'medical', intent: medical });

  const lang = detectLanguage(question);
  const keywords = extractKeywords(question);
  const base: RetrievalResult = {
    status: 'no_source',
    question,
    promptVersion: PROMPT_VERSION,
    lang,
    keywords,
    emergency,
    medical,
    hits: [],
    sources: [],
    noSourceReason: null,
    best: null,
    budget: null,
    layer1: null,
    timings,
  };
  const noSource = (reason: NoSourceReason, extra: Partial<RetrievalResult> = {}): RetrievalResult => {
    emit({ type: 'no_source', reason });
    timings.layer1Ms = now() - started;
    return { ...base, ...extra, status: 'no_source', noSourceReason: reason };
  };

  if (keywords.length === 0) return noSource('no_keywords');

  let t = now();
  const hits = await search(knowledge, keywords, cfg, options.archiveIds);
  timings.retrievalMs = now() - t;
  emit({ type: 'retrieved', hits, ms: timings.retrievalMs });
  if (isAborted(options.signal)) return { ...base, hits, status: 'aborted' };
  if (hits.length === 0) return noSource('no_hits');

  t = now();
  const articles = await extract(knowledge, hits);
  timings.extractMs = now() - t;
  if (isAborted(options.signal)) return { ...base, hits, status: 'aborted' };

  t = now();
  const countTokens = makeTokenEstimator(tokenizerProfile(cfg.modelId));
  const ranked = rankChunks(keywords, articles.flatMap((a) => chunkArticle(a, { countTokens })));
  timings.rankMs = now() - t;

  const top = ranked[0];
  const best = top ? { score: top.score, coverage: top.coverage } : null;
  if (!top || top.coverage < cfg.minCoverage || top.score < cfg.minScore) {
    return noSource('below_threshold', { hits, best });
  }

  const budget = resolveContextBudget({
    tier: cfg.tier,
    lang,
    modelId: cfg.modelId,
    contextSize: cfg.contextSize,
    reservedTokens: reservedTokens(question, lang, cfg),
  });
  const sources = toSources(selectWithinBudget(ranked, { budgetChars: budget.chars, maxSources: budget.maxSources }));
  emit({ type: 'context', sources, ms: now() - started });

  const layer1 = buildLayer1(question, sources);
  timings.layer1Ms = now() - started;
  emit({ type: 'layer1', answer: layer1, ms: timings.layer1Ms });
  return { ...base, status: 'ready', hits, best, budget, sources, layer1 };
}

export type SummaryStatus = 'shown' | 'hidden' | 'aborted';
export type SummaryHiddenReason = 'not_covered' | 'no_supported_sentence' | 'unparseable';

export interface SummaryResult {
  status: SummaryStatus;
  hiddenReason: SummaryHiddenReason | null;
  /** Fixed label shown with every AI answer; "unverified" on medical intent. */
  label: SummaryLabel;
  validation: StructuredValidation | null;
  generation: GenerateResult;
  generateMs: number;
}

export interface SummariseOptions {
  signal: AbortSignal;
  onEvent?: (event: RagEvent) => void;
  config?: Partial<RagConfig>;
  now?: () => number;
}

/**
 * Layer 2: the AI summary over the Layer 1 sources. Streams tokens; every sentence object is
 * validated as soon as it is complete and emitted only if it passes, so nothing unsupported is
 * ever shown, even mid-stream. If no sentence survives, the summary is hidden and Layer 1 stays.
 */
export async function summarise(
  retrieval: RetrievalResult,
  inference: InferenceEngine,
  options: SummariseOptions,
): Promise<SummaryResult> {
  if (retrieval.status !== 'ready' || retrieval.sources.length === 0) {
    throw new Error('summarise needs a ready retrieval with sources');
  }
  const cfg: RagConfig = { ...DEFAULT_RAG_CONFIG, ...options.config };
  const now = options.now ?? (() => Date.now());
  const emit = options.onEvent ?? (() => undefined);
  const { question, lang, sources } = retrieval;
  const label: SummaryLabel = retrieval.medical ? 'unverified-ai-summary' : 'ai-summary';
  const limits = answerLimits(lang, cfg.modelId, cfg.answerMaxTokens[lang]);
  const byId = new Map(sources.map((s) => [s.id, s]));

  let streamed = '';
  let emitted = 0;
  const t = now();
  const generation = await inference.generate(
    {
      messages: buildPrompt(question, sources, lang, limits.maxSentences),
      maxTokens: limits.maxTokens,
      temperature: cfg.temperature,
      jsonSchema: answerJsonSchema(
        sources.map((s) => s.id),
        limits,
      ),
    },
    (token) => {
      emit({ type: 'token', text: token });
      streamed += token;
      const partial = parseStructuredAnswer(streamed);
      if (!partial?.covered) return;
      while (emitted < partial.sentences.length) {
        const s = partial.sentences[emitted];
        emitted += 1;
        if (!s) continue;
        const check = checkSentence(s.text, byId.get(s.source), question, cfg.minSupport);
        if (check.kept) emit({ type: 'sentence', text: s.text, source: s.source });
      }
    },
    options.signal,
  );
  const generateMs = now() - t;

  const parsed = parseStructuredAnswer(generation.text);
  const validation = parsed ? validateStructured(parsed, sources, question, cfg.minSupport) : null;
  const aborted = generation.stopReason === 'abort';
  let hiddenReason: SummaryHiddenReason | null = null;
  if (!validation) hiddenReason = 'unparseable';
  else if (validation.notCovered) hiddenReason = 'not_covered';
  else if (validation.kept.length === 0) hiddenReason = 'no_supported_sentence';
  const status: SummaryStatus = hiddenReason ? (aborted ? 'aborted' : 'hidden') : 'shown';
  return { status, hiddenReason, label, validation, generation, generateMs };
}

export interface RagRunOptions extends RetrieveOptions {
  /** 'auto' generates the AI summary right after Layer 1 when a model is given. */
  summary: 'auto' | 'never';
}

export interface RagResult extends RetrievalResult {
  summary: SummaryResult | null;
}

/** Layer 1 and, when requested and possible, Layer 2 in one call (bench and rag-eval). */
export async function runRag(
  question: string,
  deps: { knowledge: KnowledgeEngine; inference: InferenceEngine | null },
  options: RagRunOptions,
): Promise<RagResult> {
  const retrieval = await retrieve(question, deps.knowledge, options);
  if (retrieval.status !== 'ready' || options.summary === 'never' || !deps.inference || isAborted(options.signal)) {
    return { ...retrieval, summary: null };
  }
  const summary = await summarise(retrieval, deps.inference, options);
  return { ...retrieval, summary };
}
