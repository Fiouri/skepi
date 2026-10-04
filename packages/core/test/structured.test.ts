import { describe, expect, it } from 'vitest';
import { answerJsonSchema, answerLimits, parseStructuredAnswer, validateStructured } from '../src/structured';
import type { CheckableSource } from '../src/validate';

const SOURCES: CheckableSource[] = [
  {
    id: 'S1',
    title: 'Paris',
    heading: '',
    text: 'Paris is the capital and largest city of France. It had 2,102,650 residents in January 2023.',
  },
  { id: 'S2', title: 'Water', heading: 'Purification', text: 'Boil water for at least 1 minute to kill germs.' },
];

describe('answerLimits / answerJsonSchema', () => {
  it('derives per-sentence character limits so the JSON closes within the token limit', () => {
    const en = answerLimits('en', 'qwen2.5-1.5b-instruct-q4_0.gguf');
    const el = answerLimits('el', 'qwen2.5-1.5b-instruct-q4_0.gguf');
    expect(en).toMatchObject({ maxTokens: 150, maxSentences: 3 });
    expect(el).toMatchObject({ maxTokens: 200, maxSentences: 2 });
    // Greek costs more tokens per character: shorter sentences for a similar token count.
    expect(el.maxSentenceChars).toBeLessThan(en.maxSentenceChars);
    expect(answerLimits('en', null, 20).maxSentenceChars).toBe(40);
  });

  it('restricts source ids to the ids in the prompt and bounds the output', () => {
    const schema = answerJsonSchema(['S1', 'S2'], { maxSentences: 3, maxSentenceChars: 120 }) as {
      properties: { sentences: { maxItems: number; items: { properties: { text: { maxLength: number }; source: { enum: string[] } } } } };
    };
    expect(schema.properties.sentences.items.properties.source.enum).toEqual(['S1', 'S2']);
    expect(schema.properties.sentences.items.properties.text.maxLength).toBe(120);
    expect(schema.properties.sentences.maxItems).toBe(3);
  });
});

describe('parseStructuredAnswer', () => {
  it('parses valid output and normalises ids', () => {
    expect(parseStructuredAnswer('{"covered":true,"sentences":[{"text":" Paris  is a city. ","source":"s1"}]}')).toEqual({
      covered: true,
      sentences: [{ text: 'Paris is a city.', source: 'S1' }],
      truncated: false,
    });
  });

  it('ignores stray template tokens around the object', () => {
    expect(parseStructuredAnswer('<|im_start|>assistant\n{"covered":false,"sentences":[]}')).toEqual({
      covered: false,
      sentences: [],
      truncated: false,
    });
  });

  it('recovers complete sentence objects from cut-off or streaming output', () => {
    expect(
      parseStructuredAnswer('{"covered":true,"sentences":[{"text":"Paris is \\"big\\".","source":"S1"},{"text":"Par'),
    ).toEqual({ covered: true, sentences: [{ text: 'Paris is "big".', source: 'S1' }], truncated: true });
    expect(parseStructuredAnswer('{"cov')).toBeNull();
    expect(parseStructuredAnswer('no json')).toBeNull();
  });

  it('rejects malformed complete output', () => {
    expect(parseStructuredAnswer('{"covered":"yes","sentences":[]}')).toBeNull();
    expect(parseStructuredAnswer('{"covered":true,"sentences":[{"text":1,"source":"S1"}]}')).toBeNull();
    expect(parseStructuredAnswer('[]')).toBeNull();
  });
});

describe('validateStructured', () => {
  const question = 'What is the capital of France and how many people live in Paris?';

  it('keeps only supported sentences and renders [Sx] markers', () => {
    const v = validateStructured(
      {
        covered: true,
        truncated: false,
        sentences: [
          { text: 'Paris is the capital of France.', source: 'S1' },
          { text: 'Paris has 3 million residents.', source: 'S1' },
          { text: 'Paris has a big airport.', source: 'S9' },
        ],
      },
      SOURCES,
      question,
    );
    expect(v.text).toBe('Paris is the capital of France [S1].');
    expect(v.kept).toEqual([{ text: 'Paris is the capital of France.', source: 'S1' }]);
    expect(v.cited).toEqual(['S1']);
    expect(v.invalid).toEqual(['S9']);
    expect(v.sentences.map((s) => s.reason)).toEqual([null, 'number', 'unknown_source']);
  });

  it('removes an irrelevant sentence even if its source supports it', () => {
    const v = validateStructured(
      { covered: true, truncated: false, sentences: [{ text: 'Boil water for at least 1 minute.', source: 'S2' }] },
      SOURCES,
      question,
    );
    expect(v.kept).toEqual([]);
    expect(v.sentences[0]?.reason).toBe('irrelevant');
  });

  it('shows nothing when the model reports that the sources do not cover the question', () => {
    const v = validateStructured(
      { covered: false, truncated: false, sentences: [{ text: 'Paris is the capital of France.', source: 'S1' }] },
      SOURCES,
      question,
    );
    expect(v.notCovered).toBe(true);
    expect(v.kept).toEqual([]);
    expect(v.text).toBe('');
  });
});
