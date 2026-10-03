import { NOT_COVERED_MARKER } from './prompt';

export interface ValidatedAnswer {
  /** Answer text with citations to unknown ids removed. */
  text: string;
  /** Valid cited source ids, unique, in order of first appearance. */
  cited: string[];
  /** Cited ids that do not exist in the provided sources (removed from text). */
  invalid: string[];
  /** True when the answer has zero valid citations ("unverified" label). */
  unverified: boolean;
  /** True when the model reported that the sources do not cover the question. */
  notCovered: boolean;
}

// One bracket group: [S1], [S1, S2], [S1; S2], [s3].
const CITATION_GROUP = /\[\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*\]/gi;

export function validateCitations(answer: string, knownIds: readonly string[]): ValidatedAnswer {
  const known = new Set(knownIds.map((id) => id.toUpperCase()));
  const cited: string[] = [];
  const invalid: string[] = [];

  const text = answer
    .replace(CITATION_GROUP, (_match, group: string) => {
      const ids = group.split(/[,;]/).map((id) => id.trim().toUpperCase());
      const valid = ids.filter((id) => {
        if (known.has(id)) {
          if (!cited.includes(id)) cited.push(id);
          return true;
        }
        if (!invalid.includes(id)) invalid.push(id);
        return false;
      });
      return valid.length > 0 ? valid.map((id) => `[${id}]`).join('') : '';
    })
    .replace(/[ \t]+([.,;!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const notCovered = text.includes(NOT_COVERED_MARKER);
  return { text, cited, invalid, unverified: cited.length === 0, notCovered };
}
