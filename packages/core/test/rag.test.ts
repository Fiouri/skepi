import type {
  ArticleText,
  GenerateRequest,
  GenerateResult,
  InferenceEngine,
  KnowledgeEngine,
  SearchHit,
  SearchOptions,
} from '@skepi/contracts';
import { describe, expect, it, vi } from 'vitest';
import { planQueries, runRag, type RagEvent } from '../src/rag';

const ARTICLES: Record<string, ArticleText> = {
  'A/Νερό': {
    archiveId: 'el',
    path: 'A/Νερό',
    title: 'Νερό',
    sections: [
      {
        heading: '',
        level: 1,
        text: 'Το πόσιμο νερό καθαρίζεται με βρασμό για τουλάχιστον ένα λεπτό. Ο καθαρισμός νερού σκοτώνει μικρόβια.',
      },
    ],
  },
  'A/Πάτρα': {
    archiveId: 'el',
    path: 'A/Πάτρα',
    title: 'Πάτρα',
    sections: [{ heading: '', level: 1, text: 'Η Πάτρα είναι η τρίτη μεγαλύτερη πόλη της Ελλάδας.' }],
  },
};

function fakeKnowledge(index: Record<string, string[]>): KnowledgeEngine & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    openArchive: () => Promise.reject(new Error('unused')),
    getArticle: () => Promise.reject(new Error('unused')),
    closeArchive: () => Promise.resolve(),
    search: (query: string, opts: SearchOptions): Promise<SearchHit[]> => {
      queries.push(query);
      const paths = index[query] ?? [];
      return Promise.resolve(
        paths.slice(0, opts.limit).map((path, rank) => ({
          archiveId: 'el',
          path,
          title: path,
          snippet: null,
          score: null,
          rank,
        })),
      );
    },
    getPlainText: (_archiveId: string, path: string): Promise<ArticleText> => {
      const article = ARTICLES[path];
      return article ? Promise.resolve(article) : Promise.reject(new Error(`missing ${path}`));
    },
  };
}

function fakeInference(text: string): { engine: InferenceEngine; generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(
    (_req: GenerateRequest, onToken: (t: string) => void): Promise<GenerateResult> => {
      for (const piece of text.split(' ')) onToken(`${piece} `);
      return Promise.resolve({
        text,
        promptTokens: 100,
        generatedTokens: 10,
        timeToFirstTokenMs: 5,
        tokensPerSecond: 10,
        stopReason: 'eos',
      });
    },
  );
  return {
    generate,
    engine: {
      generate,
      load: () => Promise.reject(new Error('unused')),
      unload: () => Promise.resolve(),
    },
  };
}

const signal = new AbortController().signal;

describe('runRag json mode', () => {
  it('requests grammar-constrained JSON and validates support per sentence', async () => {
    const knowledge = fakeKnowledge({ 'καθαριζω νερο': ['A/Νερό'] });
    const inference = fakeInference(
      JSON.stringify({
        covered: true,
        sentences: [
          { text: 'Το πόσιμο νερό καθαρίζεται με βρασμό.', source: 'S1' },
          { text: 'Η Πάτρα έχει λιμάνι.', source: 'S1' },
        ],
      }),
    );
    const result = await runRag('Πώς καθαρίζω νερό;', { knowledge, inference: inference.engine }, { signal });
    const req = inference.generate.mock.calls[0]?.[0] as GenerateRequest;
    expect(req.jsonSchema).toBeDefined();
    expect(result.answer?.cited).toEqual(['S1']);
    expect(result.answer?.text).toBe('Το πόσιμο νερό καθαρίζεται με βρασμό [S1]. Η Πάτρα έχει λιμάνι.');
    expect(result.structured?.sentences.map((s) => s.kept)).toEqual([true, false]);
  });

  it('falls back to marker parsing when the JSON is cut off', async () => {
    const knowledge = fakeKnowledge({ 'καθαριζω νερο': ['A/Νερό'] });
    const inference = fakeInference('{"covered":true,"sentences":[{"text":"Το νερ');
    const result = await runRag('Πώς καθαρίζω νερό;', { knowledge, inference: inference.engine }, { signal });
    expect(result.structured).toBeNull();
    expect(result.answer?.unverified).toBe(true);
  });
});

describe('planQueries', () => {
  it('starts with the conjunctive query and adds longest single terms', () => {
    expect(planQueries(['α', 'καθαρισμοσ', 'νερου'], 3)).toEqual(['α καθαρισμοσ νερου', 'καθαρισμοσ', 'νερου']);
    expect(planQueries(['νερο'], 5)).toEqual(['νερο']);
    expect(planQueries([], 5)).toEqual([]);
  });
});

describe('runRag', () => {
  it('answers from sources and validates citations', async () => {
    const knowledge = fakeKnowledge({ 'καθαριζω νερο': ['A/Νερό', 'A/Πάτρα'] });
    const inference = fakeInference('Βράζεις το νερό για ένα λεπτό [S1]. Επίσης [S4].');
    const events: RagEvent['type'][] = [];
    const result = await runRag('Πώς καθαρίζω νερό;', { knowledge, inference: inference.engine }, {
      signal,
      onEvent: (e) => events.push(e.type),
      config: { answerFormat: 'text' },
    });

    expect(result.status).toBe('answered');
    expect(result.sources[0]?.path).toBe('A/Νερό');
    expect(result.answer?.cited).toEqual(['S1']);
    expect(result.answer?.invalid).toEqual(['S4']);
    expect(result.answer?.text).not.toContain('[S4]');
    expect(events[0]).toBe('retrieved');
    expect(events).toContain('context');
    expect(events).toContain('token');

    const req = inference.generate.mock.calls[0]?.[0] as GenerateRequest;
    expect(req.temperature).toBe(0.2);
    expect(req.maxTokens).toBe(400);
    expect(req.messages[1]?.content).toContain('<source id="S1" title="Νερό">');
  });

  it('returns no source without calling the LLM when nothing is retrieved', async () => {
    const knowledge = fakeKnowledge({});
    const inference = fakeInference('should not run');
    const result = await runRag('Ποιος κέρδισε το Eurovision 1974;', { knowledge, inference: inference.engine }, { signal });
    expect(result.status).toBe('no_source');
    expect(result.noSourceReason).toBe('no_hits');
    expect(inference.generate).not.toHaveBeenCalled();
  });

  it('returns no source below the coverage threshold even when weak hits exist', async () => {
    // Only one of three keywords matches anything: a classic unrelated question.
    const knowledge = fakeKnowledge({ πατρα: ['A/Πάτρα'] });
    const inference = fakeInference('should not run');
    const result = await runRag('συνταγή σουφλέ Πάτρα', { knowledge, inference: inference.engine }, { signal });
    expect(knowledge.queries[0]).toBe('συνταγη σουφλε πατρα');
    expect(knowledge.queries.length).toBeGreaterThan(1);
    expect(result.status).toBe('no_source');
    expect(result.noSourceReason).toBe('below_threshold');
    expect(result.best?.coverage).toBeLessThan(0.6);
    expect(inference.generate).not.toHaveBeenCalled();
  });

  it('returns no source for a question without keywords and never searches', async () => {
    const knowledge = fakeKnowledge({});
    const result = await runRag('Τι είναι αυτό;', { knowledge, inference: null }, { signal });
    expect(result.noSourceReason).toBe('no_keywords');
    expect(knowledge.queries).toEqual([]);
  });

  it('emits the emergency flag before retrieval', async () => {
    const knowledge = fakeKnowledge({});
    const events: RagEvent['type'][] = [];
    const result = await runRag('Πώς σταματάω την αιμορραγία;', { knowledge, inference: null }, {
      signal,
      onEvent: (e) => events.push(e.type),
    });
    expect(events[0]).toBe('emergency');
    expect(events.indexOf('emergency')).toBeLessThan(events.indexOf('retrieved'));
    expect(result.emergency?.topics).toContain('bleeding');
  });

  it('returns sources only when no model is loaded', async () => {
    const knowledge = fakeKnowledge({ 'καθαριζω νερο': ['A/Νερό'] });
    const result = await runRag('Πώς καθαρίζω νερό;', { knowledge, inference: null }, { signal });
    expect(result.status).toBe('sources_only');
    expect(result.sources).toHaveLength(1);
  });

  it('skips articles whose text extraction fails', async () => {
    const knowledge = fakeKnowledge({ 'καθαριζω νερο': ['A/Missing', 'A/Νερό'] });
    const result = await runRag('Πώς καθαρίζω νερό;', { knowledge, inference: null }, { signal });
    expect(result.sources.map((s) => s.path)).toEqual(['A/Νερό']);
  });

  it('does not generate when aborted before generation', async () => {
    const knowledge = fakeKnowledge({ 'καθαριζω νερο': ['A/Νερό'] });
    const inference = fakeInference('x');
    const controller = new AbortController();
    controller.abort();
    const result = await runRag('Πώς καθαρίζω νερό;', { knowledge, inference: inference.engine }, { signal: controller.signal });
    expect(result.status).toBe('aborted');
    expect(inference.generate).not.toHaveBeenCalled();
  });
});
