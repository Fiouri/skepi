import { describe, expect, it } from 'vitest';
import { detectLanguage, extractKeywords, foldText, stem, tokenize } from '../src/text';
import { estimateTokens } from '../src/tokens';
import { percentile, summarize } from '../src/stats';

describe('foldText / tokenize', () => {
  it('strips Greek accents, dialytika and final sigma', () => {
    expect(foldText('Πώς ΚΑΘΑΡΊΖΩ νερό; Ϊ ΰ ς')).toBe('πωσ καθαριζω νερο; ι υ σ');
  });

  it('tokenizes letters and digits only', () => {
    expect(tokenize('Η ΚΑΡΠΑ (CPR) σε 30:2!')).toEqual(['η', 'καρπα', 'cpr', 'σε', '30', '2']);
  });
});

describe('detectLanguage', () => {
  it('detects Greek and English by script', () => {
    expect(detectLanguage('Πώς καθαρίζω νερό;')).toBe('el');
    expect(detectLanguage('How do I purify water?')).toBe('en');
    expect(detectLanguage('12345')).toBe('en');
    expect(detectLanguage('Τι είναι το GPS;')).toBe('el');
  });
});

describe('extractKeywords', () => {
  it('removes stopwords in both languages and dedupes', () => {
    expect(extractKeywords('Ποια είναι η πρωτεύουσα της Ελλάδας και η πρωτεύουσα;')).toEqual([
      'πρωτευουσα',
      'ελλαδασ',
    ]);
    expect(extractKeywords('What is the capital of Greece?')).toEqual(['capital', 'greece']);
  });

  it('returns nothing for a question made of stopwords', () => {
    expect(extractKeywords('Τι είναι αυτό;')).toEqual([]);
  });
});

describe('stem', () => {
  it('maps Greek inflections to a shared stem', () => {
    expect(stem('νερου')).toBe(stem('νερο'));
    expect(stem('σεισμοσ')).toBe(stem('σεισμου'));
    expect(stem('πατρων')).toBe(stem('πατρα'));
    expect(stem('καθαριζω')).toBe(stem('καθαριζεται'));
    expect(stem('καθαρισμοσ')).toBe(stem('καθαριζω'));
  });

  it('keeps short tokens intact', () => {
    expect(stem('οσ')).toBe('οσ');
    expect(stem('gas')).toBe('gas');
  });

  it('handles English plurals', () => {
    expect(stem('earthquakes')).toBe(stem('earthquake'));
  });
});

describe('estimateTokens', () => {
  it('counts Greek as more expensive than Latin', () => {
    expect(estimateTokens('αβγδεζηθικ')).toBeGreaterThan(estimateTokens('abcdefghij'));
    expect(estimateTokens('')).toBe(0);
  });
});

describe('stats', () => {
  it('computes nearest-rank percentiles', () => {
    const samples = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(samples, 95)).toBe(19);
    expect(percentile(samples, 50)).toBe(10);
    expect(summarize([5]).p95).toBe(5);
    expect(() => percentile([], 50)).toThrow();
  });
});
