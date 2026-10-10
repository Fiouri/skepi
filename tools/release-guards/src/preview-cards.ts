/**
 * Developer Preview builds must not contain any emergency-card advice text (steps and "when to call for
 * help", English and Greek): their bundlers resolve @skepi/emergency-cards to the preview entry. This
 * check inspects the built bundles themselves (the Android Hermes bundle, the desktop's Vite assets).
 *
 * A step is searched as its longest piece without characters a bundler may escape (quotes, backslash,
 * line breaks), in UTF-8 (JavaScript) and UTF-16LE (Hermes keeps non-ASCII strings as UTF-16).
 */
import { CARDS } from '@skepi/emergency-cards';

/** Every advice text of the full cards. */
export function adviceTexts(): string[] {
  return CARDS.flatMap((c) => Object.values(c.locales).flatMap((l) => [...l.steps, l.whenToCallForHelp])).filter((t) => t.length > 0);
}

/** The longest piece of a text without characters a bundler may escape; null when shorter than 16. */
export function probeOf(text: string): string | null {
  const best = text.split(/["'`\\\n\r\t]/).reduce((a, b) => (b.length > a.length ? b : a), '');
  return best.trim().length >= 16 ? best : null;
}

/** The advice texts found in a bundle. */
export function findAdvice(bundle: Uint8Array, texts: readonly string[] = adviceTexts()): string[] {
  const haystack = Buffer.from(bundle);
  return texts.filter((t) => {
    const probe = probeOf(t);
    if (probe === null) return false;
    return haystack.includes(Buffer.from(probe, 'utf8')) || haystack.includes(Buffer.from(probe, 'utf16le'));
  });
}
