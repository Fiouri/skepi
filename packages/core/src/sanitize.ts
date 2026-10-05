import { splitSentences } from './text';

/**
 * Source sentences that address the reader or the model instead of stating facts: forged prompt
 * markup and common prompt-injection phrases (English, Greek). They are removed from passages before
 * chunking, so neither Layer 1 (which highlights verbatim text) nor the model sees them, and a model
 * sentence that repeats one has nothing to be supported by. Lexicon-based: it catches the usual
 * phrasings, not every possible injection; answers stay citation-checked either way.
 */
const INJECTION: readonly RegExp[] = [
  /<\/?\s*source\b|‹\/?\s*source\b/i,
  /<\|?\s*(im_start|im_end|system|assistant)\b/i,
  /\b(ignore|disregard|forget)\b[^.!?]{0,40}\b(instructions?|sources?|above|previous|prior|question|rules?)\b/i,
  /\b(new|updated) instructions?\s*:/i,
  /^\s*(system|assistant|user)\s*[:,]/i,
  /\b(system|assistant)\s*:\s/i,
  /\byou are now\b/i,
  /\b(tell|instruct) the (user|reader)\b/i,
  /\bthe answer must\b/i,
  // JavaScript's \b is ASCII-only: Greek word boundaries need Unicode look-arounds.
  /(?<!\p{L})αγνό(ησε|ησέ|ηστε)(?!\p{L})/iu,
  /(?<!\p{L})ξέχασε(?!\p{L})[^.!?;]{0,40}(ερώτηση|οδηγίες|πηγές)/iu,
  /(?<!\p{L})(σύστημα|βοηθός)\s*:/iu,
  /(?<!\p{L})νέα οδηγία(?!\p{L})/iu,
  /(?<!\p{L})πες στον (χρήστη|αναγνώστη)(?!\p{L})/iu,
];

export function isInjection(sentence: string): boolean {
  return INJECTION.some((re) => re.test(sentence));
}

/** Text without its instruction-like sentences (order and wording of the rest unchanged). */
export function sanitizeSourceText(text: string): string {
  return splitSentences(text)
    .filter((s) => !isInjection(s))
    .join(' ');
}
