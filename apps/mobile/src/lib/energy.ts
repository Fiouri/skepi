import {
  batteryDeltaPct,
  chargeToPct,
  clearEnergySamples,
  estimateEnergy,
  formatEnergy,
  listAllEnergySamples,
  listEnergySamples,
  recordEnergySample,
  type EnergyAction,
} from '@skepi/db';
import { ExpoZim } from 'expo-zim';
import { ExpoDeviceProfile, type BatteryInfo } from 'expo-device-profile';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { appDb } from './db';
import { useMessages } from './i18n';

/**
 * Battery cost of costly actions, measured on this device (blackout mode: "≈ x% battery" on the
 * buttons). A sample is the battery used between the start and the end of one action, from the
 * charge counter (µAh) where the phone reports it, otherwise from the 1% level steps. Nothing is
 * recorded while charging. Samples never leave the device.
 */

/** Bumped after every recorded sample so the cost labels refresh. */
const useEnergyVersion = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => {
    set((s) => ({ version: s.version + 1 }));
  },
}));

let meterRun = 0;

/**
 * Starts the current meter for one action (where the phone reports the battery current). Its
 * integrated charge is much finer than the charge counter, which some phones update only every ~30 s.
 */
function startMeter(): string | null {
  meterRun += 1;
  const id = `energy-${String(meterRun)}`;
  try {
    return ExpoDeviceProfile.startEnergyMeter(id) ? id : null;
  } catch {
    return null;
  }
}

function stopMeter(id: string | null): number | null {
  if (id === null) return null;
  try {
    return ExpoDeviceProfile.stopEnergyMeter(id)?.chargeUah ?? null;
  } catch {
    return null;
  }
}

async function record(action: EnergyAction, tier: string, start: BatteryInfo, end: BatteryInfo, perMinute: boolean, meteredUah: number | null): Promise<void> {
  if (end.charging) return;
  const metered = meteredUah === null ? null : chargeToPct(meteredUah, start);
  const delta = metered ?? batteryDeltaPct(start, end);
  const durationMs = Math.max(0, Math.round(end.timestampMs - start.timestampMs));
  if (delta === null || durationMs === 0) return;
  const value = perMinute ? delta / (durationMs / 60_000) : delta;
  if (!Number.isFinite(value) || value > 100) return;
  await recordEnergySample(await appDb(), { action, tier, batteryDeltaPct: value, durationMs, createdAt: Date.now() });
  useEnergyVersion.getState().bump();
}

/** Runs `work` and records its battery cost (best effort: measuring never breaks the action). */
export async function measureEnergy<T>(action: EnergyAction, tier: string, work: () => Promise<T>): Promise<T> {
  const start = await ExpoDeviceProfile.getBattery().catch(() => null);
  const meter = start && !start.charging ? startMeter() : null;
  try {
    return await work();
  } finally {
    const metered = stopMeter(meter);
    if (start) {
      void ExpoDeviceProfile.getBattery()
        .then((end) => record(action, tier, start, end, false, metered))
        .catch(() => undefined);
    }
  }
}

/** Starts a measurement for an open-ended action (SOS light); call the result when it stops. */
export async function startPerMinuteMeasurement(action: EnergyAction, tier: string): Promise<() => void> {
  const start = await ExpoDeviceProfile.getBattery().catch(() => null);
  const meter = start && !start.charging ? startMeter() : null;
  return () => {
    const metered = stopMeter(meter);
    if (!start) return;
    void ExpoDeviceProfile.getBattery()
      .then((end) => (end.timestampMs - start.timestampMs >= 60_000 ? record(action, tier, start, end, true, metered) : undefined))
      .catch(() => undefined);
  };
}

/** Developer (Bench): forget all samples so the labels come only from the next measurements. */
export async function resetEnergySamples(): Promise<void> {
  await clearEnergySamples(await appDb());
  useEnergyVersion.getState().bump();
}

/**
 * Writes every measured sample with the median per action and tier to bench/energy-latest.json
 * (Bench tab; pulled over adb for the phase report). Nothing leaves the device by itself.
 */
export async function exportEnergySamples(): Promise<string> {
  const samples = await listAllEnergySamples(await appDb());
  const groups = new Map<string, typeof samples>();
  for (const s of samples) groups.set(`${s.action}|${s.tier}`, [...(groups.get(`${s.action}|${s.tier}`) ?? []), s]);
  const summary = [...groups.entries()].map(([key, list]) => {
    const [action, tier] = key.split('|');
    const estimate = estimateEnergy(list);
    return { action, tier, samples: list.length, medianPct: estimate?.pct ?? null, label: estimate ? formatEnergy(estimate) : null };
  });
  const battery = await ExpoDeviceProfile.getBattery().catch(() => null);
  const json = JSON.stringify({ schema: 1, createdAt: new Date().toISOString(), battery, summary, samples }, null, 2);
  return ExpoZim.writeContentFile('bench/energy-latest.json', json);
}

/** "≈ 1% battery" from this device's samples, or null until enough have been measured. */
export function useEnergyCost(action: EnergyAction, tier: string): string | null {
  const t = useMessages();
  const version = useEnergyVersion((s) => s.version);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const state = { alive: true };
    void (async () => {
      const samples = await listEnergySamples(await appDb(), action, tier);
      const estimate = estimateEnergy(samples);
      if (state.alive) setLabel(estimate ? t.energy.cost(formatEnergy(estimate)) : null);
    })();
    return () => {
      state.alive = false;
    };
  }, [action, tier, version, t]);
  return label;
}
