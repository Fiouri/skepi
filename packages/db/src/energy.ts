import type { SqlExecutor } from './db';

/** Costly actions whose battery cost is measured on the device (blackout mode, "≈ x% battery"). */
export const ENERGY_ACTIONS = ['ai-summary', 'gps-fix', 'sos-light-minute', 'layer1-answer'] as const;
export type EnergyAction = (typeof ENERGY_ACTIONS)[number];

export interface EnergySample {
  action: EnergyAction;
  /** Inference tier or profile the action ran with (T0/T1/T2, `t1-simulation`); cost differs per tier. */
  tier: string;
  batteryDeltaPct: number;
  durationMs: number;
  createdAt: number;
}

/** Samples kept per action and tier; older ones are dropped so the estimate follows the device. */
export const ENERGY_SAMPLES_KEPT = 20;

export async function recordEnergySample(db: SqlExecutor, s: EnergySample): Promise<void> {
  if (!ENERGY_ACTIONS.includes(s.action)) throw new Error(`unknown energy action ${s.action}`);
  if (!Number.isFinite(s.batteryDeltaPct) || s.batteryDeltaPct < 0 || s.batteryDeltaPct > 100) throw new Error('battery delta out of range');
  if (!Number.isInteger(s.durationMs) || s.durationMs < 0) throw new Error('duration must be a non-negative integer');
  await db.execute('INSERT INTO energy_samples (action, tier, battery_delta_pct, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)', [
    s.action,
    s.tier,
    s.batteryDeltaPct,
    s.durationMs,
    s.createdAt,
  ]);
  await db.execute(
    `DELETE FROM energy_samples WHERE action = ? AND tier = ? AND rowid NOT IN (
       SELECT rowid FROM energy_samples WHERE action = ? AND tier = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
    [s.action, s.tier, s.action, s.tier, ENERGY_SAMPLES_KEPT],
  );
}

export async function listEnergySamples(db: SqlExecutor, action: EnergyAction, tier: string): Promise<EnergySample[]> {
  const { rows } = await db.execute(
    'SELECT action, tier, battery_delta_pct, duration_ms, created_at FROM energy_samples WHERE action = ? AND tier = ? ORDER BY created_at DESC, rowid DESC',
    [action, tier],
  );
  return rows.map((r) => ({
    action,
    tier: String(r.tier),
    batteryDeltaPct: Number(r.battery_delta_pct),
    durationMs: Number(r.duration_ms),
    createdAt: Number(r.created_at),
  }));
}

/** Developer: forget every sample (e.g. before an unplugged measurement run). */
export async function clearEnergySamples(db: SqlExecutor): Promise<void> {
  await db.execute('DELETE FROM energy_samples', []);
}

/** Every stored sample (Bench → export, for the phase report's unplugged measurements). */
export async function listAllEnergySamples(db: SqlExecutor): Promise<EnergySample[]> {
  const { rows } = await db.execute('SELECT action, tier, battery_delta_pct, duration_ms, created_at FROM energy_samples ORDER BY action, tier, created_at', []);
  return rows.map((r) => ({
    action: String(r.action) as EnergyAction,
    tier: String(r.tier),
    batteryDeltaPct: Number(r.battery_delta_pct),
    durationMs: Number(r.duration_ms),
    createdAt: Number(r.created_at),
  }));
}

export interface EnergyEstimate {
  /** Median battery cost per action, in percent of a full battery. */
  pct: number;
  samples: number;
}

/** Fewer samples than this give no estimate (one reading is too noisy to show). */
export const MIN_ENERGY_SAMPLES = 3;

/** Median of the measured costs, or null while there are too few samples. */
export function estimateEnergy(samples: readonly Pick<EnergySample, 'batteryDeltaPct'>[]): EnergyEstimate | null {
  if (samples.length < MIN_ENERGY_SAMPLES) return null;
  const sorted = samples.map((s) => s.batteryDeltaPct).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const pct = sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return { pct, samples: sorted.length };
}

/** "≈ 1%", "≈ 0.3%", "< 0.1%": the label on costly buttons. */
export function formatEnergy(estimate: EnergyEstimate): string {
  if (estimate.pct < 0.1) return '< 0.1%';
  if (estimate.pct < 1) return `≈ ${estimate.pct.toFixed(1)}%`;
  return `≈ ${String(Math.round(estimate.pct))}%`;
}

/** A battery reading (expo-device-profile `getBattery`). */
export interface BatteryReading {
  levelPct: number | null;
  chargeCounterUah: number | null;
  charging: boolean;
}

/** Percent of a full battery used between two readings; null when it cannot be measured. */
export function batteryDeltaPct(start: BatteryReading, end: BatteryReading): number | null {
  if (start.charging || end.charging) return null;
  if (start.chargeCounterUah !== null && end.chargeCounterUah !== null && start.levelPct !== null && start.levelPct > 0) {
    const fullUah = start.chargeCounterUah / (start.levelPct / 100);
    if (fullUah <= 0) return null;
    return Math.max(0, ((start.chargeCounterUah - end.chargeCounterUah) / fullUah) * 100);
  }
  if (start.levelPct === null || end.levelPct === null) return null;
  return Math.max(0, start.levelPct - end.levelPct);
}
