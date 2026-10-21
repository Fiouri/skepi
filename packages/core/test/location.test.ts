import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  chooseHeading,
  circleRing,
  coneLengthM,
  coneRing,
  destination,
  fixState,
  followStep,
  INITIAL_FOLLOW,
  locationFeatures,
  normalizeDegrees,
  smoothHeading,
  STALE_AFTER_MS,
  type FollowEvent,
  type FollowState,
  type LocationFix,
} from '../src/location';

const fix = (over: Partial<LocationFix> = {}): LocationFix => ({
  latitude: 38.2466,
  longitude: 21.7346,
  accuracyM: 12,
  speedMps: null,
  bearingDeg: null,
  timeMs: 1_000_000,
  ...over,
});

describe('heading wrap and smoothing', () => {
  it('normalises to [0, 360)', () => {
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-1)).toBe(359);
    expect(normalizeDegrees(725)).toBe(5);
    expect(Object.is(normalizeDegrees(-360), 0)).toBe(true);
  });

  it('takes the shorter way round across 0/360', () => {
    expect(angleDelta(359, 1)).toBe(2);
    expect(angleDelta(1, 359)).toBe(-2);
    expect(angleDelta(0, 180)).toBe(180);
    expect(angleDelta(90, 270)).toBe(180);
  });

  it('takes the first reading as is', () => {
    expect(smoothHeading(null, 123)).toBe(123);
    expect(smoothHeading(null, -10)).toBe(350);
  });

  it('smooths toward the reading without jumping the long way across north', () => {
    const next = smoothHeading(350, 10, 0.5);
    expect(next).toBeCloseTo(0, 6);
    const after = smoothHeading(next, 10, 0.5);
    expect(after).toBeCloseTo(5, 6);
    expect(smoothHeading(10, 350, 0.25)).toBeCloseTo(5, 6);
  });

  it('converges on a steady reading and stays in range', () => {
    let h: number | null = null;
    for (let i = 0; i < 60; i += 1) h = smoothHeading(h, i % 2 === 0 ? 358 : 2);
    expect(h).not.toBeNull();
    expect(Math.min(Math.abs(angleDelta(h ?? 0, 0)), 5)).toBeLessThan(2);
    for (const r of [0, 90, 180, 270, 359.9]) {
      const s = smoothHeading(45, r);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(360);
    }
  });

  it('ignores a non-finite reading', () => {
    expect(smoothHeading(42, Number.NaN)).toBe(42);
  });
});

describe('which heading the cone shows', () => {
  it('prefers a usable compass', () => {
    expect(chooseHeading({ degrees: 370, accuracy: 2 }, fix({ speedMps: 10, bearingDeg: 90 }))).toEqual({ degrees: 10, source: 'compass' });
  });

  it('uses the course when the compass is unreliable or missing and the user moves faster than walking', () => {
    expect(chooseHeading({ degrees: 10, accuracy: 0 }, fix({ speedMps: 8, bearingDeg: 271 }))).toEqual({ degrees: 271, source: 'course' });
    expect(chooseHeading(null, fix({ speedMps: 3, bearingDeg: 45 }))).toEqual({ degrees: 45, source: 'course' });
  });

  it('shows no direction when walking or standing without a compass', () => {
    expect(chooseHeading(null, fix({ speedMps: 1.4, bearingDeg: 45 }))).toBeNull();
    expect(chooseHeading(null, fix({ speedMps: 6, bearingDeg: null }))).toBeNull();
    expect(chooseHeading(null, null)).toBeNull();
  });
});

describe('fix state', () => {
  it('none, live, then stale after the threshold', () => {
    expect(fixState(null, 0)).toBe('none');
    expect(fixState(fix(), 1_000_000 + STALE_AFTER_MS)).toBe('live');
    expect(fixState(fix(), 1_000_000 + STALE_AFTER_MS + 1)).toBe('stale');
    expect(fixState(fix(), 1_000_000 + 30_000, 45_000)).toBe('live');
  });
});

describe('follow mode ("My location" button)', () => {
  const run = (events: FollowEvent[]): { state: FollowState; centres: boolean[] } => {
    let state = INITIAL_FOLLOW;
    const centres: boolean[] = [];
    for (const e of events) {
      const step = followStep(state, e);
      state = step.state;
      centres.push(step.centre);
    }
    return { state, centres };
  };

  it('first press centres, second press follows, third press stops following', () => {
    const r1 = run([{ type: 'press', hasFix: true }]);
    expect(r1.state.mode).toBe('centred');
    expect(r1.centres).toEqual([true]);
    const r2 = run([{ type: 'press', hasFix: true }, { type: 'fix' }, { type: 'press', hasFix: true }, { type: 'fix' }]);
    expect(r2.state.mode).toBe('follow');
    expect(r2.centres).toEqual([true, false, true, true]);
    const r3 = run([{ type: 'press', hasFix: true }, { type: 'press', hasFix: true }, { type: 'press', hasFix: true }, { type: 'fix' }]);
    expect(r3.state.mode).toBe('centred');
    expect(r3.centres.at(-1)).toBe(false);
  });

  it('panning exits follow mode; fixes no longer move the camera', () => {
    const r = run([{ type: 'press', hasFix: true }, { type: 'press', hasFix: true }, { type: 'pan' }, { type: 'fix' }]);
    expect(r.state).toEqual(INITIAL_FOLLOW);
    expect(r.centres).toEqual([true, true, false, false]);
  });

  it('a press before the first fix centres when the fix arrives, once', () => {
    const r = run([{ type: 'press', hasFix: false }, { type: 'fix' }, { type: 'fix' }]);
    expect(r.centres).toEqual([false, true, false]);
    expect(r.state).toEqual({ mode: 'centred', centreOnFix: false });
  });

  it('panning before the first fix cancels the pending centring', () => {
    const r = run([{ type: 'press', hasFix: false }, { type: 'pan' }, { type: 'fix' }]);
    expect(r.centres).toEqual([false, false, false]);
  });
});

describe('geometry', () => {
  it('destination moves the right distance and direction', () => {
    const [lon, lat] = destination(0, 0, 111_195, 0);
    expect(lat).toBeCloseTo(1, 3);
    expect(lon).toBeCloseTo(0, 6);
    const [lonE] = destination(0, 0, 111_195, 90);
    expect(lonE).toBeCloseTo(1, 3);
  });

  it('builds a closed accuracy circle and a closed cone around the heading', () => {
    const ring = circleRing(38, 21, 50, 16);
    expect(ring).toHaveLength(17);
    expect(ring[0]).toEqual(ring[16]);
    const cone = coneRing(38, 21, 0, 100, 40, 4);
    expect(cone[0]).toEqual([21, 38]);
    expect(cone.at(-1)).toEqual([21, 38]);
    // Every far point lies north of the apex for a heading of 0°.
    for (const [, lat] of cone.slice(1, -1)) expect(lat).toBeGreaterThan(38);
  });

  it('keeps the cone about the same size on screen at every zoom', () => {
    expect(coneLengthM(0, 15) * 2).toBeCloseTo(coneLengthM(0, 14), 6);
    expect(coneLengthM(38, 20)).toBe(5);
  });

  it('draws accuracy, cone and puck; a stale fix is grey and has no cone', () => {
    const live = locationFeatures(fix(), { degrees: 90, source: 'compass' }, 'live', 15);
    expect(live.features.map((f) => f.properties.kind)).toEqual(['accuracy', 'cone', 'puck']);
    const stale = locationFeatures(fix(), { degrees: 90, source: 'compass' }, 'stale', 15);
    expect(stale.features.map((f) => f.properties.kind)).toEqual(['accuracy', 'puck']);
    expect(stale.features.every((f) => f.properties.stale)).toBe(true);
    const noAccuracy = locationFeatures(fix({ accuracyM: null }), null, 'live', 15);
    expect(noAccuracy.features.map((f) => f.properties.kind)).toEqual(['puck']);
  });
});
