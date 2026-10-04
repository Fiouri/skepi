import type { ArticleText } from '@skepi/contracts';
import { splitSentences } from './text';
import { estimateTokens, type TokenEstimator } from './tokens';

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

/**
 * Chunk sizes are in characters, like the context budgets: a chunk of a few sentences is the unit
 * Layer 1 shows and the unit the budget selects. `countTokens` only fills `Chunk.tokens` (the
 * estimate used to check that the prompt fits n_ctx).
 */
export interface ChunkOptions {
  targetChars: number;
  maxChars: number;
  /** A trailing piece shorter than this is merged into the previous chunk when it fits. */
  minTailChars: number;
  countTokens: TokenEstimator;
}

/** ~150 tokens in English, ~400 in Greek with Qwen2.5: small enough for 2–4 sources per budget. */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetChars: 600,
  maxChars: 800,
  minTailChars: 150,
  countTokens: estimateTokens,
};

/** Splits an over-long sentence on word boundaries so that no piece exceeds maxChars. */
function splitLong(sentence: string, opts: ChunkOptions): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of sentence.split(/\s+/)) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (current.length > 0 && candidate.length > opts.maxChars) {
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
    s.length > opts.maxChars ? splitLong(s, opts) : [s],
  );
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current.length === 0 ? unit : `${current} ${unit}`;
    if (current.length > 0 && candidate.length > opts.targetChars) {
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
    current.length < opts.minTailChars &&
    last.length + 1 + current.length <= opts.maxChars
  ) {
    chunks[chunks.length - 1] = `${last} ${current}`;
  } else {
    chunks.push(current);
  }
  return chunks;
}

/** Cuts every section of an article into ~targetChars chunks, never crossing section boundaries. */
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
