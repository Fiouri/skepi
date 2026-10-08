import { describe, expect, it } from 'vitest';
import { detectDesktopTier, detectMobileTier, pickModel, resolveDesktopProfile, resolveInferenceProfile, T1_PROFILE, T3_PROFILE } from '../src';

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
  it('normal mode on T2: Q4_0, performance cores, T2 budget, automatic summary, CPU', () => {
    const p = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS, simulateT1: false });
    expect(p).toMatchObject({
      mode: 'normal',
      detectedTier: 'T2',
      effectiveTier: 'T2',
      budgetTier: 'T2',
      summaryMode: 'auto',
      backend: 'cpu',
      modelId: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    });
    expect(p.load).toEqual({
      contextSize: 2048,
      threads: 5,
      cpuAffinity: [3, 4, 5, 6, 7],
      useMmap: true,
      useMlock: false,
      gpuLayers: 0,
    });
  });

  it('falls back to Q4_K_M when Q4_0 is not installed', () => {
    const p = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS.slice(0, 1), simulateT1: false });
    expect(p.modelId).toBe('qwen2.5-1.5b-instruct-q4_k_m.gguf');
  });

  it('the GPU/NPU experiment offloads all layers only when selected', () => {
    const opencl = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS, simulateT1: false, backend: 'opencl' });
    expect(opencl.load.gpuLayers).toBe(99);
    expect(opencl.load.devices).toBeUndefined();
    const htp = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS, simulateT1: false, backend: 'hexagon' });
    expect(htp.load.devices).toEqual(['HTP*']);
  });

  it('T0 has no model and T1 asks before summarising', () => {
    expect(resolveInferenceProfile({ totalRamMb: 2800, cpu: null, models: MODELS, simulateT1: false }).modelId).toBeNull();
    expect(resolveInferenceProfile({ totalRamMb: 3600, cpu: null, models: MODELS, simulateT1: false }).summaryMode).toBe('on-demand');
  });

  it('T1 simulation forces the T1 model, 2 unpinned threads, n_ctx 2048, the T1 budget and on-demand summaries', () => {
    const p = resolveInferenceProfile({ totalRamMb: 7072, cpu: S23_CPU, models: MODELS, simulateT1: true });
    expect(p).toMatchObject({ mode: 't1-simulation', detectedTier: 'T2', effectiveTier: 'T1' });
    expect(p.modelId).toBe('qwen2.5-1.5b-instruct-q4_0.gguf');
    expect(p.load.threads).toBe(2);
    expect(p.load.contextSize).toBe(2048);
    expect(p.load.cpuAffinity).toEqual([]);
    expect(p).toMatchObject({ budgetTier: 'T1', summaryMode: 'on-demand' });
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

describe('desktop tiers (Phase 3a)', () => {
  const models = [
    { id: 'qwen2.5-1.5b-instruct-q4_0.gguf', sizeBytes: 1_066_227_232 },
    { id: 'qwen2.5-0.5b-instruct-q4_0.gguf', sizeBytes: 428_730_208 },
  ];
  const cpu = { cores: 20, performanceCores: 6, performanceCoreIds: [0, 1, 2, 3, 4, 5] };

  it('is T3 with a GPU of 4 GB+ or with 16 GB RAM', () => {
    expect(detectDesktopTier(8_000, { name: 'RTX 4060 Ti', vramMb: 8188 })).toBe('T3');
    expect(detectDesktopTier(15_700, null)).toBe('T3');
    expect(detectDesktopTier(65_300, null)).toBe('T3');
    expect(detectDesktopTier(8_000, { name: 'Intel UHD', vramMb: 128 })).toBe('T2');
    expect(detectDesktopTier(5_000, null)).toBe('T1');
    expect(detectDesktopTier(2_000, { name: 'RTX', vramMb: 8000 })).toBe('T0');
  });

  it('offloads every layer on a GPU with the T3 budget and context', () => {
    const p = resolveDesktopProfile({ totalRamMb: 65_300, cpu, gpu: { name: 'RTX 4060 Ti', vramMb: 8188 }, models, simulateT1: false });
    // A mobile model keeps the T2 budget it was validated with; the T3 budget waits for a 7–9B model.
    expect(p).toMatchObject({ effectiveTier: 'T3', budgetTier: 'T2', summaryMode: 'auto', modelId: 'qwen2.5-1.5b-instruct-q4_0.gguf' });
    expect(p.load).toEqual({ contextSize: T3_PROFILE.contextSize, threads: 6, useMmap: true, useMlock: false, gpuLayers: 99 });
  });

  it('prefers a 7B model on T3 when one is installed and runs on CPU without a GPU', () => {
    const p = resolveDesktopProfile({ totalRamMb: 32_000, cpu, gpu: null, models: [...models, { id: 'qwen2.5-7b-instruct-q4_k_m.gguf', sizeBytes: 4.7e9 }], simulateT1: false });
    expect(p.modelId).toBe('qwen2.5-7b-instruct-q4_k_m.gguf');
    expect(p.budgetTier).toBe('T3');
    expect(p.load.gpuLayers).toBe(0);
  });

  it('uses the mobile profiles below T3 (unpinned) and T1-simulation as on mobile', () => {
    const t2 = resolveDesktopProfile({ totalRamMb: 8_000, cpu, gpu: null, models, simulateT1: false });
    expect(t2).toMatchObject({ effectiveTier: 'T2', budgetTier: 'T2' });
    expect(t2.load.cpuAffinity).toBeUndefined();
    const sim = resolveDesktopProfile({ totalRamMb: 65_300, cpu, gpu: { name: 'RTX', vramMb: 8188 }, models, simulateT1: true });
    expect(sim).toMatchObject({ mode: 't1-simulation', effectiveTier: 'T1', detectedTier: 'T3', summaryMode: 'on-demand' });
  });
});
