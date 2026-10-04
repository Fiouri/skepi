import { describe, expect, it } from 'vitest';
import { detectMobileTier, pickModel, resolveInferenceProfile, T1_PROFILE, TIER_BUDGET_TOKENS } from '../src';

const S23_CPU = { cores: 8, performanceCores: 5, performanceCoreIds: [3, 4, 5, 6, 7] };
const MODELS = [
  { id: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', sizeBytes: 1_117_320_736 },
  { id: 'qwen2.5-1.5b-instruct-q4_0.gguf', sizeBytes: 1_065_000_000 },
];

describe('detectMobileTier', () => {
  it('maps visible RAM to tiers', () => {
    expect(detectMobileTier(2800)).toBe('T0');
    expect(detectMobileTier(3650)).toBe('T1');
    expect(detectMobileTier(5500)).toBe('T1');
    expect(detectMobileTier(7072)).toBe('T2');
    expect(detectMobileTier(15_500)).toBe('T2');
  });

  it('treats unknown RAM as T0', () => {
    expect(detectMobileTier(Number.NaN)).toBe('T0');
    expect(detectMobileTier(-1)).toBe('T0');
  });
});

describe('pickModel', () => {
  it('takes the first preferred installed model, case-insensitively', () => {
    expect(pickModel(MODELS, ['missing.gguf', 'QWEN2.5-1.5B-INSTRUCT-Q4_0.GGUF'])).toBe('qwen2.5-1.5b-instruct-q4_0.gguf');
  });

  it('falls back to the smallest installed model, or null', () => {
    expect(pickModel(MODELS, ['missing.gguf'])).toBe('qwen2.5-1.5b-instruct-q4_0.gguf');
    expect(pickModel([], T1_PROFILE.models)).toBeNull();
  });
});

describe('resolveInferenceProfile', () => {
  it('normal mode keeps Phase 0 settings on performance cores', () => {
    const p = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS, simulateT1: false });
    expect(p).toMatchObject({ mode: 'normal', detectedTier: 'T2', effectiveTier: 'T2', modelId: MODELS[0]?.id });
    expect(p.load).toEqual({
      contextSize: 2048,
      threads: 5,
      cpuAffinity: [3, 4, 5, 6, 7],
      useMmap: true,
      useMlock: false,
      gpuLayers: 0,
    });
    expect(p.budgetTokens).toBe(TIER_BUDGET_TOKENS.T1);
  });

  it('T1 simulation forces the T1 model, 2 unpinned threads, n_ctx 2048 and the T1 budget', () => {
    const p = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS, simulateT1: true });
    expect(p).toMatchObject({ mode: 't1-simulation', detectedTier: 'T2', effectiveTier: 'T1' });
    expect(p.modelId).toBe('qwen2.5-1.5b-instruct-q4_0.gguf');
    expect(p.load.threads).toBe(2);
    expect(p.load.contextSize).toBe(2048);
    expect(p.load.cpuAffinity).toEqual([]);
    expect(p.budgetTokens).toBe(TIER_BUDGET_TOKENS.T1);
  });

  it('T1 simulation never asks for more threads than cores', () => {
    const p = resolveInferenceProfile({
      totalRamMb: 3600,
      cpu: { cores: 1, performanceCores: 1, performanceCoreIds: [0] },
      models: [],
      simulateT1: true,
    });
    expect(p.load.threads).toBe(1);
    expect(p.modelId).toBeNull();
  });

  it('normal mode without CPU info uses 4 unpinned threads', () => {
    const p = resolveInferenceProfile({ totalRamMb: 3600, cpu: null, models: MODELS, simulateT1: false });
    expect(p.effectiveTier).toBe('T1');
    expect(p.load.threads).toBe(4);
    expect(p.load.cpuAffinity).toBeUndefined();
  });
});
