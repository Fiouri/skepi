import { describe, expect, it } from 'vitest';
import { morseTimeline, SOS_TIMELINE, SOS_UNIT_MS } from '../src/morse';

describe('morseTimeline', () => {
  it('encodes SOS with standard Morse timing (units)', () => {
    const units = morseTimeline('SOS', 1);
    // S: . . .   O: - - -   S: . . .  (on, off pairs; 3-unit letter gaps, 7-unit pause to repeat)
    expect(units).toEqual([1, 1, 1, 1, 1, 3, 3, 1, 3, 1, 3, 3, 1, 1, 1, 1, 1, 7]);
    expect(units.reduce((a, b) => a + b, 0)).toBe(34);
  });

  it('scales by the unit and alternates on/off, starting with on', () => {
    expect(SOS_TIMELINE).toEqual(morseTimeline('SOS', SOS_UNIT_MS));
    expect(SOS_TIMELINE.length % 2).toBe(0);
    expect(SOS_TIMELINE[0]).toBe(SOS_UNIT_MS);
  });

  it('rejects unknown letters and bad units', () => {
    expect(() => morseTimeline('SOX')).toThrow();
    expect(() => morseTimeline('', 100)).toThrow();
    expect(() => morseTimeline('SOS', 0)).toThrow();
  });
});
