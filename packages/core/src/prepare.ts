import type { CatalogPack, CatalogTier } from './catalog';

/**
 * Onboarding "Get prepared": a storage budget maps to a preset bundle of catalog packs. English
 * defaults first (English-first product), then the AI model when the device tier runs one, then the
 * locale's own packs (the largest that still fits, e.g. the full Greek Wikipedia on 8 GB and the top
 * articles on 2 GB). Nothing here touches the network: the plan is handed to ContentStore.
 */

export const STORAGE_PRESETS_GB = [2, 8, 32] as const;
export type StoragePresetGb = (typeof STORAGE_PRESETS_GB)[number];

const GB = 1024 ** 3;
/** Always left free for the OS (same rule as ContentStore: size + 10% + 1 GB). */
export const RESERVE_BYTES = GB;
export const SPACE_FACTOR = 1.1;

const TIER_ORDER: readonly CatalogTier[] = ['T0', 'T1', 'T2', 'T3'];

export type PlanSkipReason = 'budget' | 'tier' | 'alternative';

export interface PresetPlan {
  /** Packs of the preset, in download order (already-installed ones included, not downloaded again). */
  packs: CatalogPack[];
  toDownload: CatalogPack[];
  /** Bytes of the preset on disk and of what still has to be downloaded. */
  totalBytes: number;
  downloadBytes: number;
  /** Bytes the preset may use: the budget, capped by free space minus the OS reserve. */
  usableBytes: number;
  skipped: { id: string; reason: PlanSkipReason }[];
}

export interface PresetInput {
  packs: readonly CatalogPack[];
  budgetGb: number;
  /** UI language: its locale packs join the English defaults. */
  locale: 'en' | 'el';
  /** Device tier (detectMobileTier): T0 gets no AI model. */
  tier: CatalogTier;
  freeBytes: number;
  installedIds: ReadonlySet<string>;
  /** Test catalog (debug builds against the local mirror): only packs tagged `test` take part. */
  testCatalog: boolean;
}

function tierAllows(device: CatalogTier, minTier: CatalogTier): boolean {
  return TIER_ORDER.indexOf(device) >= TIER_ORDER.indexOf(minTier);
}

/** Bytes a preset may use on this device. */
export function usableBytes(budgetGb: number, freeBytes: number): number {
  const fromFree = Math.max(0, Math.floor((freeBytes - RESERVE_BYTES) / SPACE_FACTOR));
  return Math.min(Math.round(budgetGb * GB), fromFree);
}

export function planPreset(input: PresetInput): PresetPlan {
  const usable = usableBytes(input.budgetGb, input.freeBytes);
  const chosen: CatalogPack[] = [];
  const skipped: PresetPlan['skipped'] = [];
  let used = 0;
  const take = (p: CatalogPack): boolean => {
    // Installed packs already sit on disk; they count against the budget but always stay.
    const cost = input.installedIds.has(p.id) ? 0 : p.sizeBytes;
    if (used + cost > usable && !input.installedIds.has(p.id)) return false;
    chosen.push(p);
    used += p.sizeBytes;
    return true;
  };

  const langs = new Set(['en', input.locale]);
  const candidates = input.packs.filter((p) => (input.testCatalog ? p.tags.includes('test') : !p.tags.includes('test')));
  const allowed = candidates.filter((p) => {
    // T0 devices load no model, whatever the pack's minimum tier says.
    if (!tierAllows(input.tier, p.minTier) || (p.kind === 'gguf' && input.tier === 'T0')) {
      skipped.push({ id: p.id, reason: 'tier' });
      return false;
    }
    return true;
  });

  if (input.testCatalog) {
    for (const p of allowed.filter((x) => x.lang.some((l) => langs.has(l))).sort((a, b) => a.sizeBytes - b.sizeBytes)) {
      if (!take(p)) skipped.push({ id: p.id, reason: 'budget' });
    }
  } else {
    const defaults = allowed.filter((p) => p.tags.includes('default'));
    // 1. English content defaults (encyclopedia, medical), smallest first.
    for (const p of defaults.filter((x) => x.kind !== 'gguf').sort((a, b) => a.sizeBytes - b.sizeBytes)) {
      if (!take(p)) skipped.push({ id: p.id, reason: 'budget' });
    }
    // 2. The default AI model (one), when the tier runs one.
    for (const p of defaults.filter((x) => x.kind === 'gguf')) {
      if (!take(p)) skipped.push({ id: p.id, reason: 'budget' });
    }
    // 3. Locale packs: per tag group, the largest one that fits (full edition over top articles).
    if (input.locale !== 'en') {
      const locale = allowed.filter((p) => p.tags.includes('locale') && p.lang.includes(input.locale));
      const groups = new Map<string, CatalogPack[]>();
      for (const p of locale) {
        const key = p.tags.filter((t) => t !== 'locale').sort().join('+') || p.kind;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      for (const group of groups.values()) {
        const bySize = [...group].sort((a, b) => b.sizeBytes - a.sizeBytes);
        const installed = bySize.find((p) => input.installedIds.has(p.id));
        const pick = installed ?? bySize.find((p) => used + p.sizeBytes <= usable);
        if (pick) take(pick);
        for (const p of bySize) if (p !== pick) skipped.push({ id: p.id, reason: pick ? 'alternative' : 'budget' });
      }
    }
    // Packs that are neither defaults nor locale packs (e.g. the Q4_K_M model) are alternatives.
    for (const p of allowed) {
      if (!chosen.includes(p) && !skipped.some((s) => s.id === p.id)) skipped.push({ id: p.id, reason: 'alternative' });
    }
  }

  const toDownload = chosen.filter((p) => !input.installedIds.has(p.id));
  return {
    packs: chosen,
    toDownload,
    totalBytes: chosen.reduce((n, p) => n + p.sizeBytes, 0),
    downloadBytes: toDownload.reduce((n, p) => n + p.sizeBytes, 0),
    usableBytes: usable,
    skipped,
  };
}
