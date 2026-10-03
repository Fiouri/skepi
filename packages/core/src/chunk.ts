import type { ArticleText } from '@skepi/contracts';
import { estimateTokens } from './tokens';

export interface Chunk {
  /** Stable id: `<archiveId>/<path>#<index>`. */
  id: string;
  archiveId: string;
  path: string;
  articleTitle: string;
  heading: string;
  text: string;
  tokens: number;
  /** Position of the chunk inside its article (0 = lead). */
  index: number;
}

export interface ChunkOptions {
  targetTokens: number;
  maxTokens: number;
  /** A trailing piece smaller than this is merged into the previous chunk when it fits. */
  minTailTokens: number;
  countTokens: (text: string) => number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetTokens: 250,
  maxTokens: 300,
  minTailTokens: 60,
  countTokens: estimateTokens,
};

// Sentence end: . ! ? ; (the Greek question mark is ';' or U+037E) and the Greek ano teleia.
const SENTENCE_SPLIT = /(?<=[.!?;;·])\s+/u;

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Splits an over-long sentence on word boundaries so that no piece exceeds maxTokens. */
function splitLong(sentence: string, opts: ChunkOptions): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of sentence.split(/\s+/)) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (current.length > 0 && opts.countTokens(candidate) > opts.maxTokens) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

function chunkSectionText(text: string, opts: ChunkOptions): string[] {
  const units = splitSentences(text).flatMap((s) =>
    opts.countTokens(s) > opts.maxTokens ? splitLong(s, opts) : [s],
  );
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current.length === 0 ? unit : `${current} ${unit}`;
    if (current.length > 0 && opts.countTokens(candidate) > opts.targetTokens) {
      chunks.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current.length === 0) return chunks;

  const last = chunks[chunks.length - 1];
  if (
    last !== undefined &&
    opts.countTokens(current) < opts.minTailTokens &&
    opts.countTokens(`${last} ${current}`) <= opts.maxTokens
  ) {
    chunks[chunks.length - 1] = `${last} ${current}`;
  } else {
    chunks.push(current);
  }
  return chunks;
}

/** Cuts every section of an article into ~targetTokens chunks, never crossing section boundaries. */
export function chunkArticle(article: ArticleText, options: Partial<ChunkOptions> = {}): Chunk[] {
  const opts: ChunkOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const out: Chunk[] = [];
  for (const section of article.sections) {
    const text = section.text.replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    for (const piece of chunkSectionText(text, opts)) {
      const index = out.length;
      out.push({
        id: `${article.archiveId}/${article.path}#${index}`,
        archiveId: article.archiveId,
        path: article.path,
        articleTitle: article.title,
        heading: section.heading,
        text: piece,
        tokens: opts.countTokens(piece),
        index,
      });
    }
  }
  return out;
}
