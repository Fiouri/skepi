import type { ArticleText, KnowledgeEngine, SearchHit, SearchMode, SearchOptions } from '@skepi/contracts';
import type { ScoredChunk } from './budget';
import { retrieve, type RagConfig, type RetrieveOptions } from './rag';

/**
 * Device/eval retrieval parity. The phone (libkiwix + jsoup) and rag-eval (python-libzim +
 * BeautifulSoup) must produce the same retrieval for the same question; this records every step of
 * `retrieve()` (each search list, the fused hits, the extracted text, the ranked chunks, the chosen
 * sources) in an engine-neutral form, so a mismatch points at the step where the two paths diverge.
 * Archive ids differ between engines, so archives are keyed by their ZIM `Name` metadata.
 */
export interface ParityQuery {
  id: string;
  question: string;
}

export interface ParityConfig {
  tier: RagConfig['tier'];
  modelId: string | null;
  contextSize: number;
}

export interface ParityQueryFile {
  schema: 1;
  config: ParityConfig;
  queries: ParityQuery[];
}

export interface ParityHit {
  archive: string;
  path: string;
  rank: number;
}

export interface ParitySearch {
  mode: SearchMode;
  query: string;
  hits: ParityHit[];
}

export interface ParityArticle {
  archive: string;
  path: string;
  title: string;
  sections: number;
  chars: number;
  /** FNV-1a of the extracted sections (heading, level, text): equal text ⇔ equal hash. */
  textHash: string;
}

export interface ParityChunk {
  chunk: string;
  score: number;
  coverage: number;
}

export interface ParityRecord {
  id: string;
  question: string;
  status: string;
  noSourceReason: string | null;
  keywords: string[];
  searches: ParitySearch[];
  fused: { archive: string; path: string }[];
  articles: ParityArticle[];
  /** Best chunks after BM25 + title bonus (score rounded to 1e-6). */
  ranked: ParityChunk[];
  sources: { id: string; chunk: string }[];
}

export interface ParityReport {
  schema: 1;
  engine: string;
  createdAt: string;
  config: ParityConfig;
  archives: { archiveId: string; name: string; language: string; articleCount: number }[];
  records: ParityRecord[];
}

/** Ranked chunks kept per question: enough to see a re-ordering before it reaches the sources. */
export const PARITY_RANKED_TOP = 12;

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Runs `retrieve()` for one question through a recording wrapper around `knowledge`.
 * `archiveNames` maps the engine's archive ids to ZIM names.
 */
export async function probeRetrieval(
  query: ParityQuery,
  knowledge: KnowledgeEngine,
  archiveNames: ReadonlyMap<string, string>,
  options: Pick<RetrieveOptions, 'config' | 'archives'>,
): Promise<ParityRecord> {
  const name = (archiveId: string): string => archiveNames.get(archiveId) ?? archiveId;
  const chunkKey = (chunkId: string, archiveId: string): string => `${name(archiveId)}${chunkId.slice(archiveId.length)}`;
  const searches: ParitySearch[] = [];
  const texts = new Map<string, ArticleText>();
  const recorder: KnowledgeEngine = {
    openArchive: (file) => knowledge.openArchive(file),
    getArticle: (archiveId, path) => knowledge.getArticle(archiveId, path),
    closeArchive: (archiveId) => knowledge.closeArchive(archiveId),
    search: async (q: string, opts: SearchOptions): Promise<SearchHit[]> => {
      const hits = await knowledge.search(q, opts);
      searches.push({ mode: opts.mode, query: q, hits: hits.map((h) => ({ archive: name(h.archiveId), path: h.path, rank: h.rank })) });
      return hits;
    },
    getPlainText: async (archiveId: string, path: string): Promise<ArticleText> => {
      const t = await knowledge.getPlainText(archiveId, path);
      texts.set(`${name(t.archiveId)}\n${t.path}`, t);
      return t;
    },
  };
  let ranked: readonly ScoredChunk[] = [];
  const r = await retrieve(query.question, recorder, {
    ...options,
    signal: new AbortController().signal,
    onEvent: (e) => {
      if (e.type === 'ranked') ranked = e.chunks;
    },
  });
  const articles = [...texts.values()]
    .map((t) => ({
      archive: name(t.archiveId),
      path: t.path,
      title: t.title,
      sections: t.sections.length,
      chars: t.sections.reduce((n, s) => n + s.text.length, 0),
      textHash: fnv1a(JSON.stringify(t.sections.map((s) => [s.heading, s.level, s.text]))),
    }))
    .sort((a, b) => (a.archive + a.path < b.archive + b.path ? -1 : 1));
  return {
    id: query.id,
    question: query.question,
    status: r.status,
    noSourceReason: r.noSourceReason,
    keywords: r.keywords,
    searches,
    fused: r.hits.map((h) => ({ archive: name(h.archiveId), path: h.path })),
    articles,
    ranked: ranked.slice(0, PARITY_RANKED_TOP).map((c) => ({
      chunk: chunkKey(c.chunk.id, c.chunk.archiveId),
      score: round(c.score),
      coverage: round(c.coverage),
    })),
    sources: r.sources.map((s) => ({ id: s.id, chunk: chunkKey(s.chunkId, s.archiveId) })),
  };
}

export type ParityStep = 'missing' | 'keywords' | 'search' | 'fused' | 'text' | 'ranked' | 'status' | 'sources';

export interface ParityDiff {
  id: string;
  question: string;
  /** First step (in pipeline order) where the two records differ. */
  step: ParityStep;
  detail: string;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Hits of one search, grouped by archive: engines concatenate their archives in different orders
 * (hash order on Android, open order in rag-eval), which fusion ignores by design (fusion.ts).
 */
function byArchive(s: ParitySearch): ParitySearch {
  const hits = [...s.hits].sort((p, q) => (p.archive < q.archive ? -1 : p.archive > q.archive ? 1 : p.rank - q.rank));
  return { ...s, hits };
}

function firstSearchDiff(a: readonly ParitySearch[], b: readonly ParitySearch[]): string | null {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const ai = a[i];
    const bi = b[i];
    const x = ai ? byArchive(ai) : undefined;
    const y = bi ? byArchive(bi) : undefined;
    if (!x || !y) return `search #${i}: present on one side only`;
    if (!same(x, y)) {
      const show = (s: ParitySearch): string => s.hits.map((h) => `${h.archive}:${h.path}@${h.rank}`).join(', ');
      return `${x.mode} "${x.query}" vs "${y.query}": [${show(x)}] vs [${show(y)}]`;
    }
  }
  return null;
}

/** Compares two runs record by record; an empty list means full parity. */
export function compareParity(a: ParityReport, b: ParityReport): ParityDiff[] {
  const byId = new Map(b.records.map((r) => [r.id, r]));
  const diffs: ParityDiff[] = [];
  for (const x of a.records) {
    const y = byId.get(x.id);
    const diff = (step: ParityStep, detail: string): void => {
      diffs.push({ id: x.id, question: x.question, step, detail });
    };
    if (!y) {
      diff('missing', `not in ${b.engine}`);
      continue;
    }
    if (!same(x.keywords, y.keywords)) {
      diff('keywords', `${x.keywords.join(' ')} vs ${y.keywords.join(' ')}`);
      continue;
    }
    const search = firstSearchDiff(x.searches, y.searches);
    if (search) {
      diff('search', search);
      continue;
    }
    if (!same(x.fused, y.fused)) {
      diff('fused', `${x.fused.map((h) => `${h.archive}:${h.path}`).join(', ')} vs ${y.fused.map((h) => `${h.archive}:${h.path}`).join(', ')}`);
      continue;
    }
    const yArticles = new Map(y.articles.map((t) => [`${t.archive}\n${t.path}`, t]));
    const text = x.articles.find((t) => !same(t, yArticles.get(`${t.archive}\n${t.path}`)));
    if (text || x.articles.length !== y.articles.length) {
      const other = text ? yArticles.get(`${text.archive}\n${text.path}`) : undefined;
      diff('text', text ? `${text.archive}:${text.path} ${JSON.stringify(text)} vs ${JSON.stringify(other ?? null)}` : 'article count differs');
      continue;
    }
    if (!same(x.ranked, y.ranked)) {
      const i = x.ranked.findIndex((c, k) => !same(c, y.ranked[k]));
      diff('ranked', `#${i}: ${JSON.stringify(x.ranked[i] ?? null)} vs ${JSON.stringify(y.ranked[i] ?? null)}`);
      continue;
    }
    if (x.status !== y.status || x.noSourceReason !== y.noSourceReason) {
      diff('status', `${x.status}/${x.noSourceReason ?? '-'} vs ${y.status}/${y.noSourceReason ?? '-'}`);
      continue;
    }
    if (!same(x.sources, y.sources)) {
      diff('sources', `${x.sources.map((s) => s.chunk).join(', ')} vs ${y.sources.map((s) => s.chunk).join(', ')}`);
    }
  }
  for (const y of b.records) {
    if (!a.records.some((x) => x.id === y.id)) diffs.push({ id: y.id, question: y.question, step: 'missing', detail: `not in ${a.engine}` });
  }
  return diffs;
}
