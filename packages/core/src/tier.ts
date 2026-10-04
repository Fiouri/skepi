import type { LoadOptions } from '@skepi/contracts';
import type { BudgetTier } from './budget';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';
export type ProfileMode = 'normal' | 't1-simulation';
/** How the AI summary starts: right after Layer 1 (T2+) or only when the user asks (T1). */
export type SummaryMode = 'auto' | 'on-demand';
/**
 * Android inference backend. CPU is the default everywhere; 'opencl' (Adreno GPU) and 'hexagon'
 * (Qualcomm NPU) are a Phase 1b experiment behind a developer flag, never enabled by default.
 */
export type InferenceBackend = 'cpu' | 'opencl' | 'hexagon';

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

/** Q4_0 is the default mobile quantisation (22% faster prefill than Q4_K_M on ARM, Phase 0). */
export const MOBILE_MODELS = ['qwen2.5-1.5b-instruct-q4_0.gguf', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'] as const;

/** T1 profile from docs/architecture.md: ~1–2B Q4_0 model, 2 threads, context 2048, T1 budget. */
export const T1_PROFILE = {
  contextSize: 2048,
  threads: 2,
  models: MOBILE_MODELS,
} as const;

/** T2 on mobile: same model family, performance cores, context 2048 (prefill time, not memory, is the limit). */
export const T2_PROFILE = {
  contextSize: 2048,
  models: MOBILE_MODELS,
} as const;

/** Layers offloaded when a GPU/NPU backend is selected (more than any small model has: all of them). */
const OFFLOAD_ALL_LAYERS = 99;

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
  /** Character budget tier (T0 has no AI; its Layer 1 uses the T1 budget). */
  budgetTier: BudgetTier;
  summaryMode: SummaryMode;
  backend: InferenceBackend;
  /** Model file to load, or null when none is installed. */
  modelId: string | null;
  load: LoadOptions;
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

function backendLoad(backend: InferenceBackend): Pick<LoadOptions, 'gpuLayers' | 'devices'> {
  if (backend === 'cpu') return { gpuLayers: 0 };
  if (backend === 'hexagon') return { gpuLayers: OFFLOAD_ALL_LAYERS, devices: ['HTP*'] };
  return { gpuLayers: OFFLOAD_ALL_LAYERS };
}

/**
 * Inference settings for this device. T1-simulation forces the T1 profile on any device (unpinned
 * threads, so a fast big core does not hide T1 latency, and on-demand summaries) and is recorded by
 * the bench.
 */
export function resolveInferenceProfile(input: {
  totalRamMb: number;
  cpu: CpuTopology | null;
  models: readonly AvailableModel[];
  simulateT1: boolean;
  backend?: InferenceBackend;
}): InferenceProfile {
  const detectedTier = detectMobileTier(input.totalRamMb);
  const backend = input.backend ?? 'cpu';
  const base = { useMmap: true, useMlock: false, ...backendLoad(backend) };

  if (input.simulateT1) {
    const cores = input.cpu?.cores ?? T1_PROFILE.threads;
    return {
      mode: 't1-simulation',
      detectedTier,
      effectiveTier: 'T1',
      budgetTier: 'T1',
      summaryMode: 'on-demand',
      backend,
      modelId: pickModel(input.models, T1_PROFILE.models),
      load: { ...base, contextSize: T1_PROFILE.contextSize, threads: Math.min(T1_PROFILE.threads, Math.max(1, cores)), cpuAffinity: [] },
    };
  }

  const cpu = input.cpu;
  const t2 = detectedTier === 'T2' || detectedTier === 'T3';
  return {
    mode: 'normal',
    detectedTier,
    effectiveTier: detectedTier,
    budgetTier: t2 ? 'T2' : 'T1',
    summaryMode: t2 ? 'auto' : 'on-demand',
    backend,
    modelId: detectedTier === 'T0' ? null : pickModel(input.models, t2 ? T2_PROFILE.models : T1_PROFILE.models),
    load: {
      ...base,
      contextSize: t2 ? T2_PROFILE.contextSize : T1_PROFILE.contextSize,
      threads: Math.max(1, cpu?.performanceCores ?? 4),
      ...(cpu ? { cpuAffinity: [...cpu.performanceCoreIds] } : {}),
    },
  };
}
