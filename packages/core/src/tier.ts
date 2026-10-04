import type { LoadOptions } from '@skepi/contracts';
import { TIER_BUDGET_TOKENS } from './budget';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';
export type ProfileMode = 'normal' | 't1-simulation';

/**
 * Mobile tier from the RAM visible to the OS (always below the marketed size: a 4 GB phone reports
 * ~3.5–3.8 GB, a 6 GB phone ~5.5 GB, an 8 GB phone ~7.0–7.5 GB). T3 is desktop-only.
 */
export const MOBILE_TIER_MIN_RAM_MB = { T1: 3300, T2: 6500 } as const;

export function detectMobileTier(totalRamMb: number): Tier {
  if (!Number.isFinite(totalRamMb) || totalRamMb < MOBILE_TIER_MIN_RAM_MB.T1) return 'T0';
  if (totalRamMb < MOBILE_TIER_MIN_RAM_MB.T2) return 'T1';
  return 'T2';
}

/** T1 profile from docs/architecture.md: ~1–2B Q4_0 model, 2 threads, context 2048, T1 budget. */
export const T1_PROFILE = {
  contextSize: 2048,
  threads: 2,
  budgetTokens: TIER_BUDGET_TOKENS.T1,
  /** Preferred model files, best first (Q4_0 is 22% faster to prefill than Q4_K_M on ARM). */
  models: ['qwen2.5-1.5b-instruct-q4_0.gguf', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'],
} as const;

/**
 * Normal mode keeps the Phase 0 inference settings on every tier (context 2048, performance cores,
 * T1 budget) until tier-specific settings land with the Phase 1 RAG work.
 */
export const NORMAL_PROFILE = {
  contextSize: 2048,
  budgetTokens: TIER_BUDGET_TOKENS.T1,
  models: ['qwen2.5-1.5b-instruct-q4_k_m.gguf', 'qwen2.5-1.5b-instruct-q4_0.gguf'],
} as const;

export interface CpuTopology {
  cores: number;
  performanceCores: number;
  performanceCoreIds: readonly number[];
}

export interface AvailableModel {
  id: string;
  sizeBytes: number;
}

export interface InferenceProfile {
  mode: ProfileMode;
  /** Tier detected from the device's RAM. */
  detectedTier: Tier;
  /** Tier whose settings are applied (T1 in simulation mode). */
  effectiveTier: Tier;
  /** Model file to load, or null when none is installed. */
  modelId: string | null;
  load: LoadOptions;
  budgetTokens: number;
}

/** First preferred model that is installed; otherwise the smallest installed one. */
export function pickModel(available: readonly AvailableModel[], preference: readonly string[]): string | null {
  const byId = new Map(available.map((m) => [m.id.toLowerCase(), m.id]));
  for (const wanted of preference) {
    const hit = byId.get(wanted.toLowerCase());
    if (hit !== undefined) return hit;
  }
  const smallest = [...available].sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
  return smallest?.id ?? null;
}

/**
 * Inference settings for this device. T1-simulation forces the T1 profile on any device (unpinned
 * threads, so a fast big core does not hide T1 latency) and is recorded by the bench.
 */
export function resolveInferenceProfile(input: {
  totalRamMb: number;
  cpu: CpuTopology | null;
  models: readonly AvailableModel[];
  simulateT1: boolean;
}): InferenceProfile {
  const detectedTier = detectMobileTier(input.totalRamMb);
  const base = { useMmap: true, useMlock: false, gpuLayers: 0 } as const;

  if (input.simulateT1) {
    const cores = input.cpu?.cores ?? T1_PROFILE.threads;
    return {
      mode: 't1-simulation',
      detectedTier,
      effectiveTier: 'T1',
      modelId: pickModel(input.models, T1_PROFILE.models),
      load: { ...base, contextSize: T1_PROFILE.contextSize, threads: Math.min(T1_PROFILE.threads, Math.max(1, cores)), cpuAffinity: [] },
      budgetTokens: T1_PROFILE.budgetTokens,
    };
  }

  const cpu = input.cpu;
  return {
    mode: 'normal',
    detectedTier,
    effectiveTier: detectedTier,
    modelId: pickModel(input.models, NORMAL_PROFILE.models),
    load: {
      ...base,
      contextSize: NORMAL_PROFILE.contextSize,
      threads: Math.max(1, cpu?.performanceCores ?? 4),
      ...(cpu ? { cpuAffinity: [...cpu.performanceCoreIds] } : {}),
    },
    budgetTokens: NORMAL_PROFILE.budgetTokens,
  };
}
