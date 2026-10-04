import { describe, expect, it } from 'vitest';
import {
  answerJsonSchema,
  parseStructuredAnswer,
  supportScore,
  validateStructured,
  type CitedSource,
} from '../src/structured';

const SOURCES: CitedSource[] = [
  {
    id: 'S1',
    title: 'Πάτρα',
    heading: '',
    text: 'Η Πάτρα είναι η τρίτη μεγαλύτερη πόλη της Ελλάδας με 170.934 κατοίκους. Είναι πρωτεύουσα της Αχαΐας.',
  },
  { id: 'S2', title: 'Νερό', heading: 'Καθαρισμός', text: 'Το νερό καθαρίζεται με βρασμό για ένα λεπτό.' },
];

describe('answerJsonSchema', () => {
  it('restricts source ids to the ids in the prompt', () => {
    const schema = answerJsonSchema(['S1', 'S2']) as {
      properties: { sentences: { items: { properties: { source: { enum: string[] } } } } };
    };
    expect(schema.properties.sentences.items.properties.source.enum).toEqual(['S1', 'S2']);
  });
});

describe('parseStructuredAnswer', () => {
  it('parses valid output and normalises ids', () => {
    expect(parseStructuredAnswer('{"covered":true,"sentences":[{"text":" Η Πάτρα  είναι πόλη. ","source":"s1"}]}')).toEqual({
      covered: true,
      sentences: [{ text: 'Η Πάτρα είναι πόλη.', source: 'S1' }],
    });
  });

  it('ignores stray template tokens around the object', () => {
    expect(parseStructuredAnswer('<|im_start|>assistant\n{"covered":false,"sentences":[]}')).toEqual({
      covered: false,
      sentences: [],
    });
  });

  it('rejects truncated or malformed output', () => {
    expect(parseStructuredAnswer('{"covered":true,"sentences":[{"text":"Η Πάτ')).toBeNull();
    expect(parseStructuredAnswer('{"covered":"yes","sentences":[]}')).toBeNull();
    expect(parseStructuredAnswer('{"covered":true,"sentences":[{"text":1,"source":"S1"}]}')).toBeNull();
    expect(parseStructuredAnswer('[]')).toBeNull();
  });
});

describe('supportScore', () => {
  it('is high when the sentence restates the source, across inflection', () => {
    expect(supportScore('Η Πάτρα είναι πρωτεύουσα της Αχαΐας.', SOURCES[0]?.text ?? '')).toBe(1);
  });

  it('is zero when a number is not in the source verbatim', () => {
    expect(supportScore('Η Πάτρα έχει 250.000 κατοίκους.', SOURCES[0]?.text ?? '')).toBe(0);
    expect(supportScore('Η Πάτρα έχει 170.934 κατοίκους.', SOURCES[0]?.text ?? '')).toBe(1);
  });

  it('is low for content the source does not contain', () => {
    expect(supportScore('Το νερό βράζει για ένα λεπτό.', SOURCES[0]?.text ?? '')).toBeLessThan(0.5);
  });
});

describe('validateStructured', () => {
  it('keeps supported citations and renders [Sx] markers', () => {
    const v = validateStructured(
      {
        covered: true,
        sentences: [
          { text: 'Η Πάτρα είναι η τρίτη μεγαλύτερη πόλη της Ελλάδας.', source: 'S1' },
          { text: 'Το νερό καθαρίζεται με βρασμό.', source: 'S2' },
        ],
      },
      SOURCES,
    );
    expect(v.text).toBe('Η Πάτρα είναι η τρίτη μεγαλύτερη πόλη της Ελλάδας [S1]. Το νερό καθαρίζεται με βρασμό [S2].');
    expect(v.cited).toEqual(['S1', 'S2']);
    expect(v.unverified).toBe(false);
  });

  it('drops a citation whose sentence the source does not support', () => {
    const v = validateStructured(
      { covered: true, sentences: [{ text: 'Η Πάτρα έχει μετρό και αεροδρόμιο.', source: 'S2' }] },
      SOURCES,
    );
    expect(v.cited).toEqual([]);
    expect(v.unsupported).toEqual(['S2']);
    expect(v.unverified).toBe(true);
    expect(v.text).not.toContain('[S2]');
  });

  it('flags unknown ids and not-covered answers', () => {
    expect(validateStructured({ covered: true, sentences: [{ text: 'x y z', source: 'S9' }] }, SOURCES).invalid).toEqual(['S9']);
    const nc = validateStructured({ covered: false, sentences: [{ text: 'Η Πάτρα είναι πόλη.', source: 'S1' }] }, SOURCES);
    expect(nc.notCovered).toBe(true);
    expect(nc.cited).toEqual([]);
  });
});
