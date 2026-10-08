import { describe, expect, it } from 'vitest';
import type { DeviceInfo, PackRow } from './ipc';
import { activeProfile, installedModels, newestVerified } from './store';

const gguf: PackRow = {
  id: 'qwen2.5-1.5b-instruct-q4_0',
  kind: 'gguf',
  version: '1',
  title: 'Qwen',
  path: 'D:/SKEPI/models/qwen2.5-1.5b-instruct-q4_0.gguf',
  sizeBytes: 1_066_227_232,
  sha256: 'a'.repeat(64),
  verified: true,
  catalogSeq: 3,
  license: 'Apache-2.0',
  source: 'download',
  consentAt: null,
  installedAt: 1,
  lastOpenedAt: null,
};

const device: DeviceInfo = {
  snapshot: { totalRamMb: 65_300, freeRamMb: 40_000, freeDiskMb: 1, batteryPct: 100, charging: true, thermal: 'nominal' },
  cpu: { cores: 20, performanceCores: 6, performanceCoreIds: [0, 2, 4, 6, 8, 10] },
  gpu: { index: 0, name: 'Vulkan0', description: 'RTX', backend: 'Vulkan', vramMb: 8188, integrated: false },
  loaded: null,
};

describe('desktop profile and power cap', () => {
  it('uses the file name as model id (tokenizer profile) and keeps the pack id', () => {
    expect(installedModels([gguf, { ...gguf, id: 'x', verified: false }])).toEqual([{ id: 'qwen2.5-1.5b-instruct-q4_0.gguf', path: gguf.path, sizeBytes: gguf.sizeBytes, packId: gguf.id }]);
  });

  it('T3 on a GPU with full offload; the cap lowers threads, GPU use or turns AI off', () => {
    const full = activeProfile({ device, packs: [gguf], simulateT1: false, powerCap: 'full' });
    expect(full.profile.effectiveTier).toBe('T3');
    expect(full.profile.load).toMatchObject({ threads: 6, gpuLayers: 99, contextSize: 8192 });
    expect(full.model?.packId).toBe(gguf.id);
    expect(activeProfile({ device, packs: [gguf], simulateT1: false, powerCap: 'balanced' }).profile.load.threads).toBe(3);
    const low = activeProfile({ device, packs: [gguf], simulateT1: false, powerCap: 'low' });
    expect(low.profile.load).toMatchObject({ threads: 2, gpuLayers: 0 });
    expect(low.profile.summaryMode).toBe('on-demand');
    expect(activeProfile({ device, packs: [gguf], simulateT1: false, powerCap: 'off' }).model).toBeNull();
  });

  it('an integrated GPU does not make a small machine T3', () => {
    const small: DeviceInfo = { ...device, snapshot: { ...device.snapshot, totalRamMb: 7_900 }, gpu: { index: 1, name: 'Vulkan1', description: 'iGPU', backend: 'Vulkan', integrated: true, vramMb: 32_000 } };
    expect(activeProfile({ device: small, packs: [gguf], simulateT1: false, powerCap: 'full' }).profile.effectiveTier).toBe('T2');
  });

  it('only verified map packs are used, newest first', () => {
    const map = (id: string, version: string, verified: boolean): PackRow => ({ ...gguf, id, kind: 'pmtiles', version, verified });
    expect(newestVerified([map('a', '2025', true), map('b', '2026', true), map('c', '2027', false)], 'pmtiles').map((p) => p.id)).toEqual(['b', 'a']);
  });
});
