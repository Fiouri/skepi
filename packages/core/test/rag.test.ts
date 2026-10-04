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
import { planQueries, retrieve, runRag, summarise, type RagEvent } from '../src/rag';
import { SYSTEM_PROMPT } from '../src/prompt';

const ARTICLES: Record<string, ArticleText> = {
  Water_purification: {
    archiveId: 'en',
    path: 'Water_purification',
    title: 'Water purification',
    sections: [
      {
        heading: 'Boiling',
        level: 2,
        text: 'Boiling water for at least 1 minute kills most germs. At high altitude boil water for 3 minutes.',
      },
    ],
  },
  Paris: {
    archiveId: 'en',
    path: 'Paris',
    title: 'Paris',
    sections: [{ heading: '', level: 1, text: 'Paris is the capital and largest city of France.' }],
  },
  Paracetamol: {
    archiveId: 'en',
    path: 'Paracetamol',
    title: 'Paracetamol',
    sections: [{ heading: 'Dosage', level: 2, text: 'The usual adult dose of paracetamol is 500 mg to 1 g every 4 to 6 hours.' }],
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
        paths.slice(0, opts.limit).map((path, rank) => ({ archiveId: 'en', path, title: path, snippet: null, score: null, rank })),
      );
    },
    getPlainText: (_archiveId: string, path: string): Promise<ArticleText> => {
      const article = ARTICLES[path];
      return article ? Promise.resolve(article) : Promise.reject(new Error(`missing ${path}`));
    },
  };
}

function fakeInference(text: string, stopReason: GenerateResult['stopReason'] = 'eos') {
  const generate = vi.fn((_req: GenerateRequest, onToken: (t: string) => void): Promise<GenerateResult> => {
    // Stream in small pieces so sentence objects complete mid-stream.
    for (let i = 0; i < text.length; i += 7) onToken(text.slice(i, i + 7));
    return Promise.resolve({
      text,
      promptTokens: 300,
      cachedPromptTokens: 60,
      generatedTokens: 40,
      timeToFirstTokenMs: 5,
      tokensPerSecond: 10,
      stopReason,
    });
  });
  const engine: InferenceEngine = { generate, load: () => Promise.reject(new Error('unused')), unload: () => Promise.resolve() };
  return { engine, generate };
}

const signal = new AbortController().signal;
const WATER_INDEX = { 'long boil water': ['Water_purification', 'Paris'] };
const WATER_Q = 'How long should I boil water?';

describe('planQueries', () => {
  it('starts with the conjunctive query and adds longest single terms', () => {
    expect(planQueries(['a', 'purification', 'water'], 3)).toEqual(['a purification water', 'purification', 'water']);
    expect(planQueries(['water'], 5)).toEqual(['water']);
    expect(planQueries([], 5)).toEqual([]);
  });
});

describe('retrieve (Layer 1)', () => {
  it('returns sources and the extractive answer without any model', async () => {
    const events: RagEvent['type'][] = [];
    const r = await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), {
      signal,
      onEvent: (e) => events.push(e.type),
      config: { tier: 'T1', modelId: 'qwen2.5-1.5b-instruct-q4_0.gguf' },
    });
    expect(r.status).toBe('ready');
    expect(r.sources[0]).toMatchObject({ id: 'S1', path: 'Water_purification', heading: 'Boiling' });
    expect(r.layer1?.passages[0]).toMatchObject({ sourceId: 'S1', anchor: 'Boiling' });
    expect(r.layer1?.passages[0]?.sentences[0]?.highlighted).toBe(true);
    expect(r.budget).toMatchObject({ tier: 'T1', lang: 'en', chars: 1800 });
    expect(events).toEqual(['retrieved', 'context', 'layer1']);
    expect(r.timings.layer1Ms).toBeGreaterThanOrEqual(0);
  });

  it('never selects more source text than the character budget', async () => {
    const r = await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), { signal, config: { tier: 'T1' } });
    const chars = r.sources.reduce((n, s) => n + s.text.length, 0);
    expect(chars).toBeLessThanOrEqual(r.budget?.chars ?? 0);
  });

  it('flags emergency and medical intent before retrieval', async () => {
    const events: RagEvent['type'][] = [];
    const r = await retrieve('How to stop bleeding from a wound?', fakeKnowledge({}), { signal, onEvent: (e) => events.push(e.type) });
    expect(events.slice(0, 3)).toEqual(['emergency', 'medical', 'retrieved']);
    expect(r.emergency?.topics).toContain('bleeding');
    expect(r.medical).not.toBeNull();
  });

  it('returns no source without hits, below threshold, or without keywords', async () => {
    expect((await retrieve('Who won Eurovision 1974?', fakeKnowledge({}), { signal })).noSourceReason).toBe('no_hits');
    const weak = await retrieve('souffle recipe Paris', fakeKnowledge({ paris: ['Paris'] }), { signal });
    expect(weak.noSourceReason).toBe('below_threshold');
    expect(weak.best?.coverage).toBeLessThan(0.6);
    const empty = fakeKnowledge({});
    expect((await retrieve('What is this?', empty, { signal })).noSourceReason).toBe('no_keywords');
    expect(empty.queries).toEqual([]);
  });

  it('skips articles whose text extraction fails', async () => {
    const r = await retrieve(WATER_Q, fakeKnowledge({ 'long boil water': ['Missing', 'Water_purification'] }), { signal });
    expect(r.sources.map((s) => s.path)).toEqual(['Water_purification']);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), { signal: controller.signal })).status).toBe('aborted');
  });
});

describe('summarise (Layer 2)', () => {
  const answer = (sentences: { text: string; source: string }[], covered = true): string => JSON.stringify({ covered, sentences });

  it('sends the fixed system prompt, a bounded JSON schema and the 150-token English limit', async () => {
    const r = await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), { signal });
    const inference = fakeInference(answer([{ text: 'Boil water for at least 1 minute.', source: 'S1' }]));
    const s = await summarise(r, inference.engine, { signal });
    const req = inference.generate.mock.calls[0]?.[0];
    expect(req?.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(req?.maxTokens).toBe(150);
    expect(req?.temperature).toBe(0.2);
    expect(JSON.stringify(req?.jsonSchema)).toContain('"maxLength"');
    expect(req?.messages[1]?.content).toContain('<source id="S1" title="Water purification — Boiling">');
    expect(s).toMatchObject({ status: 'shown', label: 'ai-summary', hiddenReason: null });
    expect(s.validation?.text).toBe('Boil water for at least 1 minute [S1].');
  });

  it('streams only sentences that pass validation', async () => {
    const r = await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), { signal });
    const inference = fakeInference(
      answer([
        { text: 'Boil water for at least 1 minute.', source: 'S1' },
        { text: 'Boil water for 20 minutes.', source: 'S1' },
        { text: 'It kills most germs.', source: 'S1' },
        { text: 'Paris is the capital of France.', source: 'S7' },
      ]),
    );
    const streamed: string[] = [];
    const s = await summarise(r, inference.engine, {
      signal,
      onEvent: (e) => {
        if (e.type === 'sentence') streamed.push(e.text);
      },
    });
    expect(streamed).toEqual(['Boil water for at least 1 minute.']);
    expect(s.validation?.sentences.map((x) => x.reason)).toEqual([null, 'number_unit', 'irrelevant', 'unknown_source']);
  });

  it('hides the summary when no sentence survives, or when not covered, or unparseable', async () => {
    const r = await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), { signal });
    const none = await summarise(r, fakeInference(answer([{ text: 'Boil water for 20 minutes.', source: 'S1' }])).engine, { signal });
    expect(none).toMatchObject({ status: 'hidden', hiddenReason: 'no_supported_sentence' });
    const notCovered = await summarise(r, fakeInference(answer([], false)).engine, { signal });
    expect(notCovered.hiddenReason).toBe('not_covered');
    const garbage = await summarise(r, fakeInference('{"cov').engine, { signal });
    expect(garbage.hiddenReason).toBe('unparseable');
  });

  it('labels medical answers as unverified', async () => {
    const r = await retrieve('What is the usual adult dose of paracetamol?', fakeKnowledge({ 'usual adult dose paracetamol': ['Paracetamol'] }), {
      signal,
    });
    expect(r.medical).not.toBeNull();
    const s = await summarise(r, fakeInference(answer([{ text: 'The usual adult dose of paracetamol is 500 mg.', source: 'S1' }])).engine, {
      signal,
    });
    expect(s).toMatchObject({ status: 'shown', label: 'unverified-ai-summary' });
  });

  it('every shown summary carries a label', async () => {
    const r = await retrieve(WATER_Q, fakeKnowledge(WATER_INDEX), { signal });
    const s = await summarise(r, fakeInference(answer([{ text: 'Boil water for at least 1 minute.', source: 'S1' }])).engine, { signal });
    expect(['ai-summary', 'unverified-ai-summary']).toContain(s.label);
  });

  it('refuses to run without a ready retrieval', async () => {
    const r = await retrieve('What is this?', fakeKnowledge({}), { signal });
    await expect(summarise(r, fakeInference('{}').engine, { signal })).rejects.toThrow();
  });
});

describe('runRag', () => {
  it('generates only when asked and a model is given', async () => {
    const inference = fakeInference(JSON.stringify({ covered: true, sentences: [{ text: 'Boil water for at least 1 minute.', source: 'S1' }] }));
    const never = await runRag(WATER_Q, { knowledge: fakeKnowledge(WATER_INDEX), inference: inference.engine }, { signal, summary: 'never' });
    expect(never.summary).toBeNull();
    expect(inference.generate).not.toHaveBeenCalled();
    const auto = await runRag(WATER_Q, { knowledge: fakeKnowledge(WATER_INDEX), inference: inference.engine }, { signal, summary: 'auto' });
    expect(auto.summary?.status).toBe('shown');
    const noModel = await runRag(WATER_Q, { knowledge: fakeKnowledge(WATER_INDEX), inference: null }, { signal, summary: 'auto' });
    expect(noModel.summary).toBeNull();
    expect(noModel.layer1?.passages.length).toBeGreaterThan(0);
  });

  it('never calls the model below the no-source threshold', async () => {
    const inference = fakeInference('should not run');
    const r = await runRag('souffle recipe Paris', { knowledge: fakeKnowledge({ paris: ['Paris'] }), inference: inference.engine }, {
      signal,
      summary: 'auto',
    });
    expect(r.status).toBe('no_source');
    expect(inference.generate).not.toHaveBeenCalled();
  });
});
