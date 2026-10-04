import { describe, expect, it } from 'vitest';
import {
  bigramSupport,
  checkSentence,
  contentBigrams,
  findNumberUnits,
  isCoherent,
  isRelevant,
  numbersVerbatim,
  numberUnitsVerbatim,
} from '../src/validate';

const PARIS = 'Paris is the capital and largest city of France, with 2,102,650 residents in 2023.';
const ATHLETE =
  'Spyridon Louis was a Greek water carrier who won the first modern-day Olympic marathon at the 1896 Summer Olympics. ' +
  'The town of Marousi, where he was born in 1872, honours him. The stadium was rebuilt in 1884 by the architect.';
const WATER = 'Boil water for at least 1 minute to kill germs. At altitudes above 2,000 m, boil for 3 minutes. Use 2 drops of bleach per litre.';

describe('contentBigrams / bigramSupport', () => {
  it('builds unordered pairs of adjacent content terms', () => {
    expect(contentBigrams('The capital of France')).toEqual(['capita|franc']);
    expect(contentBigrams('France')).toEqual([]);
  });

  it('supports a restatement, including reordered terms within the source window', () => {
    expect(bigramSupport('Paris is the capital of France.', { title: '', text: PARIS })).toBe(1);
    expect(bigramSupport("France's capital is Paris.", { title: '', text: PARIS })).toBe(1);
  });

  it('only pairs terms inside one source sentence, plus title terms with everything', () => {
    expect(bigramSupport('Louis rebuilt the stadium.', { title: '', text: ATHLETE })).toBeLessThan(1);
    expect(bigramSupport('Spyridon Louis won the Olympic marathon.', { title: '', text: ATHLETE })).toBe(1);
    expect(bigramSupport('Paris is the capital of France.', { title: 'Paris', text: 'It is the capital of France.' })).toBe(1);
    expect(bigramSupport('Paris is the capital of France.', { title: '', text: 'It is the capital of France.' })).toBe(0.5);
  });

  it('works across Greek inflection', () => {
    const source = 'Η Πάτρα είναι η πρωτεύουσα του νομού Αχαΐας και το μεγαλύτερο λιμάνι της Πελοποννήσου.';
    expect(bigramSupport('Η Πάτρα είναι πρωτεύουσα της Αχαΐας.', { title: '', text: source })).toBeGreaterThanOrEqual(0.5);
    expect(bigramSupport('Η Αχαΐα έχει μετρό.', { title: '', text: source })).toBe(0);
  });

  it('scores a sentence without two content terms as 0', () => {
    expect(bigramSupport('Yes.', { title: '', text: PARIS })).toBe(0);
  });
});

describe('isCoherent', () => {
  it('rejects a sentence stitched from two source sentences even when most bigrams are supported', () => {
    // Phase 0 failure mode: every word is in the source, but not as one fact.
    const sentence = 'Spyridon Louis rebuilt the stadium in 1884.';
    expect(bigramSupport(sentence, { title: '', text: ATHLETE })).toBe(0.75);
    expect(isCoherent(sentence, { title: '', text: ATHLETE })).toBe(false);
  });

  it('accepts a sentence whose terms all come from one source sentence', () => {
    expect(isCoherent('Louis won the first Olympic marathon in 1896.', { title: '', text: ATHLETE })).toBe(true);
    expect(isCoherent('The stadium was rebuilt in 1884.', { title: '', text: ATHLETE })).toBe(true);
  });
});

describe('isRelevant', () => {
  it('needs at least one shared content term with the question', () => {
    expect(isRelevant('Paris is the capital of France.', 'What is the capital of France?')).toBe(true);
    expect(isRelevant('Paris has 2,102,650 residents.', 'What is the capital of France?')).toBe(false);
    expect(isRelevant('Η Πάτρα είναι λιμάνι.', 'Πού βρίσκεται η Πάτρα;')).toBe(true);
    expect(isRelevant('Anything at all.', 'What is it?')).toBe(false);
  });
});

describe('number and unit rule', () => {
  it('finds numbers with units in English and Greek, normalising spacing and case', () => {
    expect(findNumberUnits('Take 500 mg every 6 hours, max 4 tablets; 37.5 °C and 10%.')).toEqual([
      '500mg',
      '6hours',
      '4tablets',
      '37.5°c',
      '10%',
    ]);
    expect(findNumberUnits('Βράστε για 3 λεπτά, 2 φορές τη μέρα.')).toEqual(['3λεπτα', '2φορεσ']);
    expect(findNumberUnits('Dose 15 mg/kg.')).toEqual(['15mg/kg']);
    expect(findNumberUnits('In 1896 the games began.')).toEqual([]);
  });

  it('requires every number with a unit verbatim in the source', () => {
    expect(numberUnitsVerbatim('Boil it for 1 minute.', WATER)).toBe(true);
    expect(numberUnitsVerbatim('Boil it for 3 minutes at altitude.', WATER)).toBe(true);
    expect(numberUnitsVerbatim('Boil it for 5 minutes.', WATER)).toBe(false);
    // Same number, different unit: still a violation.
    expect(numberUnitsVerbatim('Use 2 tablets of bleach.', WATER)).toBe(false);
    expect(numberUnitsVerbatim('Use 2 drops of bleach.', WATER)).toBe(true);
  });

  it('matches bare numbers as whole numbers, not substrings', () => {
    expect(numbersVerbatim('It has 2,102,650 residents.', PARIS)).toBe(true);
    expect(numbersVerbatim('It has 2,102 residents.', PARIS)).toBe(false);
    expect(numbersVerbatim('It was in 202.', PARIS)).toBe(false);
  });
});

describe('checkSentence', () => {
  const source = { id: 'S1', title: 'Water purification', heading: 'Boiling', text: WATER };

  it('keeps a supported, relevant sentence', () => {
    expect(checkSentence('Boil water for at least 1 minute.', source, 'How long should I boil water?')).toEqual({
      kept: true,
      support: 1,
      reason: null,
    });
  });

  it('drops unknown source ids', () => {
    expect(checkSentence('Boil water for 1 minute.', undefined, 'How long to boil water?')).toEqual({
      kept: false,
      support: null,
      reason: 'unknown_source',
    });
  });

  it('removes a sentence whose dose is not in the source, even if otherwise supported', () => {
    expect(checkSentence('Boil water for at least 10 minutes.', source, 'How long should I boil water?').reason).toBe('number_unit');
  });

  it('removes an irrelevant sentence even when the source supports it', () => {
    expect(checkSentence('Use drops of bleach per litre.', source, 'How long should I boil water?').reason).toBe('irrelevant');
  });

  it('removes an unsupported sentence', () => {
    expect(checkSentence('Water kills germs in sunlight quickly.', source, 'How do I kill germs in water?').reason).toBe('unsupported');
  });
});
