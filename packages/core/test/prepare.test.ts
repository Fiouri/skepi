import { describe, expect, it } from 'vitest';
import type { CatalogPack } from '../src/catalog';
import { planPreset, RESERVE_BYTES, usableBytes, type PresetInput } from '../src/prepare';

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const pack = (id: string, sizeMb: number, extra: Partial<CatalogPack>): CatalogPack => ({
  id,
  kind: 'zim',
  version: '1',
  file: `${id}.zim`,
  title: { en: id },
  lang: ['en'],
  sizeBytes: sizeMb * MB,
  sha256: '0'.repeat(64),
  chunkSize: 64 * MB,
  chunkSha256: [],
  urls: [`https://example.org/${id}`],
  license: 'CC-BY-SA-4.0',
  attribution: 'x',
  minTier: 'T0',
  tags: [],
  ...extra,
});

// The release catalog's packs (sizes rounded).
const PACKS: CatalogPack[] = [
  pack('wikipedia_en_top_mini', 283, { tags: ['encyclopedia', 'default'] }),
  pack('wikipedia_en_medicine_mini', 155, { tags: ['medical', 'default'] }),
  pack('wikipedia_el_top_mini', 113, { lang: ['el'], tags: ['encyclopedia', 'locale'] }),
  pack('wikipedia_el_all_mini', 524, { lang: ['el'], tags: ['encyclopedia', 'locale'] }),
  pack('qwen-q4_0', 1017, { kind: 'gguf', lang: ['en', 'el'], minTier: 'T1', tags: ['model', 'default'] }),
  pack('qwen-q4_k_m', 1066, { kind: 'gguf', lang: ['en', 'el'], minTier: 'T1', tags: ['model'] }),
  pack('test-smoke-en', 1, { tags: ['test'] }),
  pack('test-corrupt', 1, { lang: ['el'], tags: ['test'] }),
];

const base: PresetInput = {
  packs: PACKS,
  budgetGb: 2,
  locale: 'en',
  tier: 'T2',
  freeBytes: 100 * GB,
  installedIds: new Set(),
  testCatalog: false,
};
const ids = (input: Partial<PresetInput>): string[] => planPreset({ ...base, ...input }).packs.map((p) => p.id);

describe('planPreset', () => {
  it('2 GB, English, T2: English defaults then the model', () => {
    expect(ids({})).toEqual(['wikipedia_en_medicine_mini', 'wikipedia_en_top_mini', 'qwen-q4_0']);
  });

  it('small budget, Greek: adds the Greek top articles (the full edition does not fit)', () => {
    const plan = planPreset({ ...base, locale: 'el', budgetGb: 1.6 });
    expect(plan.packs.map((p) => p.id)).toEqual(['wikipedia_en_medicine_mini', 'wikipedia_en_top_mini', 'qwen-q4_0', 'wikipedia_el_top_mini']);
    expect(plan.skipped).toContainEqual({ id: 'wikipedia_el_all_mini', reason: 'alternative' });
    expect(plan.totalBytes).toBeLessThanOrEqual(1.6 * GB);
  });

  it('2 GB, Greek: the full Greek Wikipedia instead of the top articles', () => {
    expect(ids({ locale: 'el', budgetGb: 2 })).toEqual([
      'wikipedia_en_medicine_mini',
      'wikipedia_en_top_mini',
      'qwen-q4_0',
      'wikipedia_el_all_mini',
    ]);
  });

  it('T0 gets no model; the alternative model is never part of a preset', () => {
    const plan = planPreset({ ...base, tier: 'T0', budgetGb: 32 });
    expect(plan.packs.map((p) => p.id)).toEqual(['wikipedia_en_medicine_mini', 'wikipedia_en_top_mini']);
    expect(plan.skipped).toContainEqual({ id: 'qwen-q4_0', reason: 'tier' });
    expect(planPreset({ ...base, budgetGb: 32 }).skipped).toContainEqual({ id: 'qwen-q4_k_m', reason: 'alternative' });
  });

  it('caps the budget by free space minus the OS reserve', () => {
    const free = RESERVE_BYTES + 600 * MB;
    expect(usableBytes(8, free)).toBe(Math.floor((600 * MB) / 1.1));
    expect(ids({ freeBytes: free, budgetGb: 8 })).toEqual(['wikipedia_en_medicine_mini', 'wikipedia_en_top_mini']);
    expect(usableBytes(2, 0)).toBe(0);
  });

  it('keeps installed packs and downloads only the rest', () => {
    const plan = planPreset({ ...base, installedIds: new Set(['wikipedia_en_top_mini']) });
    expect(plan.toDownload.map((p) => p.id)).toEqual(['wikipedia_en_medicine_mini', 'qwen-q4_0']);
    expect(plan.downloadBytes).toBe((155 + 1017) * MB);
  });

  it('test catalog: only test packs in the UI languages, never the real ones', () => {
    expect(ids({ testCatalog: true })).toEqual(['test-smoke-en']);
    expect(ids({ testCatalog: true, locale: 'el' }).sort()).toEqual(['test-corrupt', 'test-smoke-en']);
  });
});
