import type {
  ArticleText,
  GenerateResult,
  InferenceEngine,
  KnowledgeEngine,
  SearchHit,
} from '@skepi/contracts';
import { rankBm25 } from './bm25';
import { selectWithinBudget, TIER_BUDGET_TOKENS, type ScoredChunk } from './budget';
import { chunkArticle, type Chunk } from './chunk';
import { validateCitations, type ValidatedAnswer } from './citations';
import { detectEmergency, type EmergencyMatch } from './emergency';
import { reciprocalRankFusion } from './fusion';
import { buildPrompt, PROMPT_VERSION, type PromptSource } from './prompt';
import { detectLanguage, extractKeywords, type Lang } from './text';

export interface RagConfig {
  /** Articles kept after fusion (spec: top 8). */
  fulltextTopK: number;
  /** Maximum number of Xapian queries per question (1 conjunctive + per-keyword fallbacks). */
  maxQueries: number;
  budgetTokens: number;
  maxSources: number;
  /** No-source threshold: the best chunk must contain this fraction of the query terms… */
  minCoverage: number;
  /** …and reach at least this BM25 score. */
  minScore: number;
  maxTokens: number;
  temperature: number;
}

export const DEFAULT_RAG_CONFIG: RagConfig = {
  fulltextTopK: 8,
  maxQueries: 5,
  budgetTokens: TIER_BUDGET_TOKENS.T1,
  maxSources: 6,
  minCoverage: 0.6,
  minScore: 0.5,
  maxTokens: 400,
  temperature: 0.2,
};

export interface RagSource extends PromptSource {
  archiveId: string;
  path: string;
  score: number;
  tokens: number;
}

export type NoSourceReason = 'no_keywords' | 'no_hits' | 'below_threshold';

export type RagEvent =
  | { type: 'emergency'; match: EmergencyMatch }
  | { type: 'retrieved'; hits: SearchHit[]; ms: number }
  | { type: 'context'; sources: RagSource[] }
  | { type: 'no_source'; reason: NoSourceReason }
  | { type: 'token'; text: string };

export interface RagTimings {
  retrievalMs: number;
  extractMs: number;
  rankMs: number;
  generateMs: number;
}

export type RagStatus = 'answered' | 'no_source' | 'sources_only' | 'aborted';

export interface RagResult {
  status: RagStatus;
  promptVersion: string;
  lang: Lang;
  keywords: string[];
  emergency: EmergencyMatch | null;
  hits: SearchHit[];
  sources: RagSource[];
  noSourceReason: NoSourceReason | null;
  best: { score: number; coverage: number } | null;
  answer: ValidatedAnswer | null;
  generation: GenerateResult | null;
  timings: RagTimings;
}

export interface RagDeps {
  knowledge: KnowledgeEngine;
  /** Null when no model is loaded or the device tier has no AI: retrieval still runs. */
  inference: InferenceEngine | null;
  now?: () => number;
}

export interface RagRunOptions {
  signal: AbortSignal;
  onEvent?: (event: RagEvent) => void;
  config?: Partial<RagConfig>;
  archiveIds?: readonly string[];
}

/** Reads the live flag; the signal can flip while retrieval is awaited. */
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

async function retrieve(
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

/**
 * Grounded question answering: emergency check → full-text retrieval →
 * plain-text sections → chunks → BM25 → budget → prompt → generation →
 * citation validation. Below the no-source threshold the LLM is never called.
 */
export async function runRag(question: string, deps: RagDeps, options: RagRunOptions): Promise<RagResult> {
  const cfg: RagConfig = { ...DEFAULT_RAG_CONFIG, ...options.config };
  const now = deps.now ?? (() => Date.now());
  const emit = options.onEvent ?? (() => undefined);
  const timings: RagTimings = { retrievalMs: 0, extractMs: 0, rankMs: 0, generateMs: 0 };

  const emergency = detectEmergency(question);
  if (emergency) emit({ type: 'emergency', match: emergency });

  const lang = detectLanguage(question);
  const keywords = extractKeywords(question);
  const base: RagResult = {
    status: 'no_source',
    promptVersion: PROMPT_VERSION,
    lang,
    keywords,
    emergency,
    hits: [],
    sources: [],
    noSourceReason: null,
    best: null,
    answer: null,
    generation: null,
    timings,
  };
  const noSource = (reason: NoSourceReason, extra: Partial<RagResult> = {}): RagResult => {
    emit({ type: 'no_source', reason });
    return { ...base, ...extra, status: 'no_source', noSourceReason: reason };
  };

  if (keywords.length === 0) return noSource('no_keywords');

  let t = now();
  const hits = await retrieve(deps.knowledge, keywords, cfg, options.archiveIds);
  timings.retrievalMs = now() - t;
  emit({ type: 'retrieved', hits, ms: timings.retrievalMs });
  if (isAborted(options.signal)) return { ...base, hits, status: 'aborted' };
  if (hits.length === 0) return noSource('no_hits');

  t = now();
  const articles = await extract(deps.knowledge, hits);
  timings.extractMs = now() - t;

  t = now();
  const ranked = rankChunks(keywords, articles.flatMap((a) => chunkArticle(a)));
  timings.rankMs = now() - t;

  const top = ranked[0];
  const best = top ? { score: top.score, coverage: top.coverage } : null;
  if (!top || top.coverage < cfg.minCoverage || top.score < cfg.minScore) {
    return noSource('below_threshold', { hits, best });
  }

  const sources = toSources(selectWithinBudget(ranked, { budgetTokens: cfg.budgetTokens, maxSources: cfg.maxSources }));
  emit({ type: 'context', sources });
  const withContext: RagResult = { ...base, hits, best, sources };

  if (!deps.inference) return { ...withContext, status: 'sources_only' };
  if (isAborted(options.signal)) return { ...withContext, status: 'aborted' };

  t = now();
  const generation = await deps.inference.generate(
    { messages: buildPrompt(question, sources, lang), maxTokens: cfg.maxTokens, temperature: cfg.temperature },
    (token) => {
      emit({ type: 'token', text: token });
    },
    options.signal,
  );
  timings.generateMs = now() - t;

  const answer = validateCitations(generation.text, sources.map((s) => s.id));
  return {
    ...withContext,
    status: generation.stopReason === 'abort' ? 'aborted' : 'answered',
    answer,
    generation,
  };
}
