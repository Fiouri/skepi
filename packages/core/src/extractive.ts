import { contentTerms, questionTerms, splitSentences } from './text';

/**
 * Layer 1: the extractive answer. Verbatim source sentences, ranked by overlap with the question's
 * content terms, shown before any model work starts. Always correct in the sense that every word is
 * the source's own; it needs no LLM and runs in a few milliseconds.
 */

export interface ExtractiveSource {
  id: string;
  archiveId: string;
  path: string;
  title: string;
  heading: string;
  text: string;
}

export interface Layer1Sentence {
  text: string;
  highlighted: boolean;
  /** Distinct question terms in the sentence. */
  matched: number;
  score: number;
}

export interface Layer1Passage {
  sourceId: string;
  archiveId: string;
  path: string;
  title: string;
  heading: string;
  /** Fragment of the section inside the article (ZIM/Wikipedia heading ids), null for the lead. */
  anchor: string | null;
  sentences: Layer1Sentence[];
  /** Best sentence score of the passage. */
  score: number;
}

export interface Layer1Answer {
  passages: Layer1Passage[];
  highlighted: number;
}

export interface Layer1Options {
  maxPassages: number;
  maxHighlightsPerPassage: number;
  /** A sentence is highlighted only if its score reaches this fraction of the best sentence score. */
  relativeCutoff: number;
}

export const DEFAULT_LAYER1_OPTIONS: Layer1Options = {
  maxPassages: 3,
  maxHighlightsPerPassage: 2,
  relativeCutoff: 0.5,
};

/** Wikipedia (mwoffliner) section ids are the heading text with spaces replaced by underscores. */
export function sectionAnchor(heading: string): string | null {
  const trimmed = heading.trim();
  return trimmed.length === 0 ? null : trimmed.replace(/\s+/g, '_');
}

const key = (term: string): string => term.slice(0, 6);

function adjacentPairs(terms: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < terms.length; i += 1) out.add(`${terms[i] ?? ''} ${terms[i + 1] ?? ''}`);
  return out;
}

/**
 * Sentence score = share of the question's distinct content terms in the sentence, plus a bonus of
 * 0.25 per question bigram that appears as adjacent terms in the sentence (phrase match).
 */
export function scoreSentence(sentence: string, questionKeys: readonly string[]): { matched: number; score: number } {
  if (questionKeys.length === 0) return { matched: 0, score: 0 };
  const terms = contentTerms(sentence).map(key);
  const present = new Set(terms);
  const matched = questionKeys.filter((k) => present.has(k)).length;
  const sentencePairs = adjacentPairs(terms);
  let phrase = 0;
  for (const pair of adjacentPairs(questionKeys)) if (sentencePairs.has(pair)) phrase += 1;
  return { matched, score: matched / questionKeys.length + 0.25 * phrase };
}

export function buildLayer1(
  question: string,
  sources: readonly ExtractiveSource[],
  options: Partial<Layer1Options> = {},
): Layer1Answer {
  const opts = { ...DEFAULT_LAYER1_OPTIONS, ...options };
  const questionKeys = [...new Set(questionTerms(question).map(key))];

  const scored = sources.map((source, order) => {
    const sentences = splitSentences(source.text).map((text) => ({ text, ...scoreSentence(text, questionKeys) }));
    const best = sentences.reduce((max, s) => Math.max(max, s.score), 0);
    return { source, order, sentences, best };
  });
  const bestOverall = scored.reduce((max, p) => Math.max(max, p.best), 0);
  const cutoff = bestOverall * opts.relativeCutoff;

  const passages: Layer1Passage[] = scored
    .filter((p) => p.best > 0)
    // Best sentence first; retrieval order breaks ties (it already reflects BM25 over the chunk).
    .sort((a, b) => b.best - a.best || a.order - b.order)
    .slice(0, opts.maxPassages)
    .map((p) => {
      const chosen = new Set(
        p.sentences
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.matched > 0 && s.score >= cutoff)
          .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
          .slice(0, opts.maxHighlightsPerPassage)
          .map(({ i }) => i),
      );
      return {
        sourceId: p.source.id,
        archiveId: p.source.archiveId,
        path: p.source.path,
        title: p.source.title,
        heading: p.source.heading,
        anchor: sectionAnchor(p.source.heading),
        sentences: p.sentences.map((s, i) => ({ ...s, highlighted: chosen.has(i) })),
        score: p.best,
      };
    });

  return {
    passages,
    highlighted: passages.reduce((n, p) => n + p.sentences.filter((s) => s.highlighted).length, 0),
  };
}
