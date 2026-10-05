/**
 * SOS light timing (Tools tab): International Morse timing in units — dot 1, dash 3, gap inside a
 * letter 1, between letters 3, between words (here: between repeats) 7. The native torch module plays
 * the timeline; the screen mode uses the same one, so both blink identically.
 */

const CODE: Readonly<Record<string, string>> = { S: '...', O: '---' };

/** SOS unit length: slow enough to read by eye from a distance. */
export const SOS_UNIT_MS = 250;

/**
 * Alternating on/off durations in ms, starting with "on" and ending with the 7-unit pause before the
 * next repeat, so the timeline can loop.
 */
export function morseTimeline(text: string, unitMs: number = SOS_UNIT_MS): number[] {
  if (!Number.isInteger(unitMs) || unitMs <= 0) throw new Error('unitMs must be a positive integer');
  const letters = text.toUpperCase().replace(/\s+/g, '');
  if (letters.length === 0) throw new Error('nothing to send');
  const out: number[] = [];
  for (let li = 0; li < letters.length; li += 1) {
    const letter = letters.charAt(li);
    const code = CODE[letter];
    if (code === undefined) throw new Error(`no Morse code for ${letter}`);
    for (let si = 0; si < code.length; si += 1) {
      out.push((code.charAt(si) === '.' ? 1 : 3) * unitMs);
      const lastSymbol = si === code.length - 1;
      out.push((lastSymbol ? (li === letters.length - 1 ? 7 : 3) : 1) * unitMs);
    }
  }
  return out;
}

export const SOS_TIMELINE: readonly number[] = morseTimeline('SOS');
