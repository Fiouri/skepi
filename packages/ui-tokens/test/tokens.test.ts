import { describe, expect, it } from 'vitest';
import { BLACKOUT, CONTRAST_PAIRS, contrastRatio, LIGHT, POI_COLORS, POI_OUTLINE, THEMES } from '../src';

describe('themes', () => {
  it.each(Object.values(THEMES).flatMap((theme) => CONTRAST_PAIRS.map((p) => [theme.name, p.fg, p.bg, p.kind] as const)))(
    '%s: %s on %s meets WCAG AA (%s)',
    (name, fg, bg, kind) => {
      const theme = THEMES[name];
      expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(kind === 'text' ? 4.5 : 3);
    },
  );

  it('blackout is pure black with animations off; light keeps animations', () => {
    expect(BLACKOUT.bg).toBe('#000000');
    expect(BLACKOUT.animations).toBe(false);
    expect(LIGHT.animations).toBe(true);
  });

  it.each(Object.entries(POI_COLORS))('POI marker %s stands out from its white outline (3:1)', (_name, color) => {
    expect(contrastRatio(color, POI_OUTLINE)).toBeGreaterThanOrEqual(3);
  });

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(() => contrastRatio('red', '#fff')).toThrow();
  });
});
