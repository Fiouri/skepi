import type { ArticleText, GenerateResult, InferenceEngine, KnowledgeEngine, SearchHit } from '@skepi/contracts';
import { rankBm25 } from './bm25';
import { resolveContextBudget, selectWithinBudget, type BudgetTier, type ContextBudget, type ScoredChunk } from './budget';
import { chunkArticle, type Chunk } from './chunk';
import { detectEmergency, type EmergencyMatch } from './emergency';
import { buildLayer1, type Layer1Answer } from './extractive';
import { reciprocalRankFusion } from './fusion';
import { detectMedicalIntent, type MedicalIntent } from './medical';
import { buildPrompt, PROMPT_VERSION, SYSTEM_PROMPT, type PromptSource } from './prompt';
import { sanitizeSourceText } from './sanitize';
import {
  ANSWER_MAX_TOKENS,
  answerJsonSchema,
  answerLimits,
  parseStructuredAnswer,
  validateStructured,
  type StructuredValidation,
} from './structured';
import { contentTerms, detectLanguage, extractKeywords, toQueryTerm, type Lang } from './text';
import { makeTokenEstimator, tokenizerProfile } from './tokens';
import { checkSentence, findNumbers, MIN_BIGRAM_SUPPORT } from './validate';

export interface RagConfig {
  /** Articles kept after fusion (spec: top 8). */
  fulltextTopK: number;
  /** Maximum number of Xapian queries per question (1 conjunctive + per-keyword fallbacks). */
  maxQueries: number;
  /** Title-suggestion queries per question (all keywords + adjacent pairs) and hits kept from each. */
  maxSuggestions: number;
  suggestTopK: number;
  /** No-source threshold, applied to every passage: it must contain this fraction of the query terms… */
  minCoverage: number;
  /** …and reach at least this score (BM25 + title bonus). */
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
  maxSuggestions: 3,
  suggestTopK: 3,
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
  const terms = keywords.map(toQueryTerm);
  const queries = [terms.join(' ')];
  if (terms.length > 1) {
    const singles = [...terms].sort((a, b) => b.length - a.length);
    for (const k of singles) {
      if (queries.length >= maxQueries) break;
      queries.push(k);
    }
  }
  return queries;
}

/**
 * Title-suggestion queries: all keywords, then adjacent keyword pairs. "What is DNA?" or "How tall is
 * Mount Everest?" are about the article whose title is in the question; full-text ranking alone
 * often buries it under longer articles that mention every term.
 */
export function planSuggestions(keywords: readonly string[], maxSuggestions: number): string[] {
  if (keywords.length === 0 || maxSuggestions <= 0) return [];
  const terms = keywords.map(toQueryTerm);
  const out = [terms.join(' ')];
  for (let i = 0; i + 1 < terms.length && out.length < maxSuggestions; i += 1) {
    const pair = `${terms[i] ?? ''} ${terms[i + 1] ?? ''}`;
    if (!out.includes(pair)) out.push(pair);
  }
  return out;
}

async function search(
  knowledge: KnowledgeEngine,
  keywords: readonly string[],
  cfg: RagConfig,
  archiveIds: readonly string[] | undefined,
): Promise<SearchHit[]> {
  const scope = archiveIds ? { archiveIds } : {};
  const lists: SearchHit[][] = [];
  // Every list goes into the fusion: a conjunctive query that fills top-K with articles that merely
  // mention all terms must not hide the article a single keyword or the title points to.
  for (const q of planQueries(keywords, cfg.maxQueries)) {
    lists.push(await knowledge.search(q, { mode: 'fulltext', limit: cfg.fulltextTopK, ...scope }));
  }
  for (const q of planSuggestions(keywords, cfg.maxSuggestions)) {
    lists.push(await knowledge.search(q, { mode: 'suggest', limit: cfg.suggestTopK, ...scope }));
  }
  return reciprocalRankFusion(lists).slice(0, cfg.fulltextTopK);
}

/**
 * Plain text of the hits, one entry per article: a redirect and its target resolve to the same
 * article ("Australia Capital Territory" → "Australian Capital Territory") and would otherwise fill
 * the budget with the same chunks twice.
 */
async function extract(knowledge: KnowledgeEngine, hits: readonly SearchHit[]): Promise<ArticleText[]> {
  const settled = await Promise.allSettled(hits.map((h) => knowledge.getPlainText(h.archiveId, h.path)));
  const seen = new Set<string>();
  return settled.flatMap((s) => {
    if (s.status !== 'fulfilled') return [];
    const key = `${s.value.archiveId}
${s.value.path}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const sections = s.value.sections.map((sec) => ({ ...sec, text: sanitizeSourceText(sec.text) }));
    return [{ ...s.value, sections }];
  });
}

/** Weight of the title match in the chunk score (BM25 is ~0–10 over a small candidate set). */
export const TITLE_BOOST = 1.5;

/** Share of the article title's content terms that the question contains (1 = the title is in the question). */
function titleOverlap(title: string, queryStems: ReadonlySet<string>): number {
  const terms = [...new Set(contentTerms(title))];
  if (terms.length === 0) return 0;
  return terms.filter((t) => queryStems.has(t)).length / terms.length;
}

/**
 * BM25 over the candidate chunks plus a title bonus. BM25 alone collapses when every candidate
 * contains the only query term ("What is DNA?": IDF → 0), and it cannot tell the DNA article from
 * an article that mentions DNA often.
 */
export function rankChunks(keywords: readonly string[], chunks: readonly Chunk[]): ScoredChunk[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const queryStems = new Set(keywords.flatMap((k) => contentTerms(k)));
  return rankBm25(
    keywords,
    chunks.map((c) => ({ id: c.id, text: `${c.articleTitle} ${c.heading} ${c.text}` })),
  )
    .flatMap((r) => {
      const chunk = byId.get(r.id);
      if (!chunk || r.matchedTerms === 0) return chunk ? [{ chunk, score: 0, coverage: 0 }] : [];
      return [{ chunk, score: r.score + TITLE_BOOST * titleOverlap(chunk.articleTitle, queryStems), coverage: r.coverage }];
    })
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);
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

/**
 * A passage can answer the question only if it covers enough of its terms and contains every number
 * the question names ("Who won the 2034 World Cup?" is not answered by a passage about 2022).
 */
function isEligible(r: ScoredChunk, question: string, cfg: RagConfig): boolean {
  if (r.coverage < cfg.minCoverage || r.score < cfg.minScore) return false;
  const numbers = findNumbers(question);
  if (numbers.length === 0) return true;
  const available = new Set(findNumbers(`${r.chunk.articleTitle} ${r.chunk.heading} ${r.chunk.text}`));
  return numbers.every((n) => available.has(n));
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
  // Every passage must pass the same bar as the best one: off-topic chunks that share one term
  // ("Aristotle's four causes" for "What causes earthquakes?") otherwise fill the budget, show up in
  // Layer 1 and get cited by the model (rag-eval, Phase 1b).
  // The no-source gate looks at the best chunk only (as calibrated in Phase 0): a question whose
  // best match is weak has no source, even if some lower-ranked chunk happens to cover its terms.
  const eligible = ranked.filter((r) => isEligible(r, question, cfg));
  if (!top || !isEligible(top, question, cfg)) {
    return noSource('below_threshold', { hits, best });
  }

  // When the question names an article ("Who was Julius Caesar?"), answer from that article: other
  // eligible articles that share a title word (Gaius Caesar) were the main source of wrong citations.
  const queryStems = new Set(keywords.flatMap((k) => contentTerms(k)));
  const focus = eligible.filter((r) => titleOverlap(r.chunk.articleTitle, queryStems) === 1);
  const candidates = focus.length > 0 ? focus : eligible;

  const budget = resolveContextBudget({
    tier: cfg.tier,
    lang,
    modelId: cfg.modelId,
    contextSize: cfg.contextSize,
    reservedTokens: reservedTokens(question, lang, cfg),
  });
  const sources = toSources(selectWithinBudget(candidates, { budgetChars: budget.chars, maxSources: budget.maxSources }));
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
