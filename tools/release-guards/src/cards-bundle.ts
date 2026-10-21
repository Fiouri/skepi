/**
 * Emergency-card text in the built bundles (the Android Hermes bundle, the iOS main.jsbundle, the
 * desktop's Vite assets):
 * - unsourced texts (the cards' former US public-domain steps and their Greek translation, which have
 *   no IFRC source; data/unsourced-card-texts.json) must never be in any bundle;
 * - sourced texts (the IFRC excerpts of @skepi/emergency-cards) may be in a bundle only when the
 *   committed source-check lock records a passed tools/cards-source-check of exactly those steps.
 *
 * A text is searched as its longest piece without characters a bundler may escape (ASCII quotes,
 * backslash, line breaks), in UTF-8 (JavaScript), UTF-16LE (Hermes keeps non-ASCII strings as UTF-16)
 * and with non-ASCII characters as \uXXXX escapes (esbuild's ASCII output).
 */
import { readFileSync } from 'node:fs';
import { CARDS } from '@skepi/emergency-cards';

interface UnsourcedFile {
  texts: { card: string; locale: string; text: string }[];
}

/** The card texts without an IFRC source (never shipped). */
export function unsourcedTexts(): string[] {
  const data = JSON.parse(readFileSync(new URL('../data/unsourced-card-texts.json', import.meta.url), 'utf8')) as UnsourcedFile;
  return data.texts.map((t) => t.text);
}

/** The IFRC excerpts the cards ship. */
export function sourcedTexts(): string[] {
  return CARDS.flatMap((c) => c.steps.map((s) => s.text));
}

/** The longest piece of a text without characters a bundler may escape; null when shorter than 16. */
export function probeOf(text: string): string | null {
  const best = text.split(/["'`\\\n\r\t]/).reduce((a, b) => (b.length > a.length ? b : a), '');
  return best.trim().length >= 16 ? best : null;
}

/** The probe with every non-ASCII UTF-16 code unit written as a JavaScript \uXXXX escape. */
function escaped(probe: string, upper: boolean): string {
  let out = '';
  for (let i = 0; i < probe.length; i += 1) {
    const code = probe.charCodeAt(i);
    if (code < 0x80) {
      out += probe.charAt(i);
      continue;
    }
    const hex = code.toString(16).padStart(4, '0');
    out += `\\u${upper ? hex.toUpperCase() : hex}`;
  }
  return out;
}

/** The byte patterns that reveal a text in a bundle. */
export function patternsOf(text: string): Buffer[] {
  const probe = probeOf(text);
  if (probe === null) return [];
  const out = [Buffer.from(probe, 'utf8'), Buffer.from(probe, 'utf16le')];
  const lower = escaped(probe, false);
  if (lower !== probe) out.push(Buffer.from(lower, 'latin1'), Buffer.from(escaped(probe, true), 'latin1'));
  return out;
}

/** The texts found in any of the bundles. */
export function findTexts(bundles: readonly Uint8Array[], texts: readonly string[]): string[] {
  const haystacks = bundles.map((b) => Buffer.from(b));
  return texts.filter((t) => {
    const patterns = patternsOf(t);
    return patterns.length > 0 && haystacks.some((h) => patterns.some((p) => h.includes(p)));
  });
}
