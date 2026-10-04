import { describe, expect, it } from 'vitest';
import { buildLayer1, scoreSentence, sectionAnchor, type ExtractiveSource } from '../src/extractive';

const SOURCES: ExtractiveSource[] = [
  {
    id: 'S1',
    archiveId: 'en',
    path: 'Water_purification',
    title: 'Water purification',
    heading: 'Boiling',
    text: 'Boiling is the oldest method. Boil water for at least one minute to kill germs. The water should then cool.',
  },
  {
    id: 'S2',
    archiveId: 'en',
    path: 'Paris',
    title: 'Paris',
    heading: '',
    text: 'Paris is the capital of France. It is known for art.',
  },
  {
    id: 'S3',
    archiveId: 'en',
    path: 'Kettle',
    title: 'Kettle',
    heading: 'Use',
    text: 'A kettle is used to boil water quickly. Electric kettles switch off automatically.',
  },
];

describe('scoreSentence', () => {
  it('scores the share of question terms plus a phrase bonus', () => {
    expect(scoreSentence('Boil water for one minute.', ['boil', 'water'])).toEqual({ matched: 2, score: 1.25 });
    expect(scoreSentence('Water is wet.', ['boil', 'water'])).toEqual({ matched: 1, score: 0.5 });
    expect(scoreSentence('Nothing here.', [])).toEqual({ matched: 0, score: 0 });
  });
});

describe('buildLayer1', () => {
  it('ranks passages by their best sentence and highlights the matching sentences', () => {
    const answer = buildLayer1('How long should I boil water?', SOURCES);
    expect(answer.passages.map((p) => p.sourceId)).toEqual(['S1', 'S3']);
    const first = answer.passages[0];
    // "The water should then cool." matches one term of three: below half the best score.
    expect(first?.sentences.filter((s) => s.highlighted).map((s) => s.text)).toEqual([
      'Boil water for at least one minute to kill germs.',
    ]);
    expect(first?.anchor).toBe('Boiling');
    expect(first?.title).toBe('Water purification');
    expect(answer.highlighted).toBe(2);
  });

  it('keeps every sentence verbatim and in order', () => {
    const answer = buildLayer1('boil water', SOURCES);
    expect(answer.passages[0]?.sentences.map((s) => s.text).join(' ')).toBe(SOURCES[0]?.text);
  });

  it('honours maxPassages and maxHighlightsPerPassage', () => {
    const answer = buildLayer1('water', SOURCES, { maxPassages: 1, maxHighlightsPerPassage: 1 });
    expect(answer.passages).toHaveLength(1);
    expect(answer.passages[0]?.sentences.filter((s) => s.highlighted)).toHaveLength(1);
  });

  it('returns no passage when nothing matches the question', () => {
    expect(buildLayer1('Eurovision winner', SOURCES)).toEqual({ passages: [], highlighted: 0 });
  });

  it('works for Greek questions across inflection', () => {
    const answer = buildLayer1('Πού βρίσκεται η Πάτρα;', [
      { id: 'S1', archiveId: 'el', path: 'Πάτρα', title: 'Πάτρα', heading: '', text: 'Η Πάτρα βρίσκεται στην Αχαΐα. Έχει λιμάνι.' },
    ]);
    expect(answer.passages[0]?.sentences[0]?.highlighted).toBe(true);
    expect(answer.passages[0]?.anchor).toBeNull();
  });
});

describe('sectionAnchor', () => {
  it('maps headings to Wikipedia section ids', () => {
    expect(sectionAnchor('Water treatment  methods')).toBe('Water_treatment_methods');
    expect(sectionAnchor('  ')).toBeNull();
  });
});
