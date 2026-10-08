import type { InstalledModel } from '@skepi/contracts';
import { resolveDesktopProfile, type ArchiveRef, type InferenceProfile, type RagConfig } from '@skepi/core';
import { create } from 'zustand';
import { createKnowledge, DesktopLlama } from './adapters';
import { ipc, type CatalogSummary, type DeviceInfo, type HashProgress, type OpenArchive, type PackRow, type ReconcileReport } from './ipc';

export type PowerCap = 'full' | 'balanced' | 'low' | 'off';

interface DesktopModel extends InstalledModel {
  packId: string;
}

interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  verifying: HashProgress | null;
  root: string;
  catalog: CatalogSummary | null;
  packs: PackRow[];
  archives: OpenArchive[];
  reconcile: ReconcileReport | null;
  device: DeviceInfo | null;
  blackout: boolean;
  simulateT1: boolean;
  greekUi: boolean;
  powerCap: PowerCap;
  country: string | null;
  /** The disclaimer (educational content, not medical advice, no warranty) was accepted. */
  disclaimerAccepted: boolean;
  acceptDisclaimer: () => void;
  bootstrap: () => Promise<void>;
  /** Re-reads packs and re-opens archives (after a download, import, consent, removal or folder change). */
  refresh: () => Promise<void>;
  setBlackout: (on: boolean) => void;
  setSimulateT1: (on: boolean) => void;
  setGreekUi: (on: boolean) => void;
  setPowerCap: (cap: PowerCap) => void;
}

const POWER_CAPS: readonly PowerCap[] = ['full', 'balanced', 'low', 'off'];

function persist(key: string, value: unknown): void {
  void ipc.settingsSet(key, value).catch(() => undefined);
}

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  error: null,
  verifying: null,
  root: '',
  catalog: null,
  packs: [],
  archives: [],
  reconcile: null,
  device: null,
  blackout: false,
  simulateT1: false,
  greekUi: false,
  powerCap: 'full',
  country: null,
  disclaimerAccepted: false,
  acceptDisclaimer() {
    set({ disclaimerAccepted: true });
    persist('disclaimer.acceptedAt', Date.now());
  },
  async bootstrap() {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const [device, blackout, simulateT1, greekUi, powerCap, country, disclaimer] = await Promise.all([
        ipc.deviceInfo(),
        ipc.settingsGet('blackout.enabled'),
        ipc.settingsGet('dev.simulateT1'),
        ipc.settingsGet('dev.greekUi'),
        ipc.settingsGet('desktop.aiPowerCap'),
        ipc.settingsGet('region.country'),
        ipc.settingsGet('disclaimer.acceptedAt'),
      ]);
      set({
        device,
        blackout: blackout === true,
        simulateT1: simulateT1 === true,
        greekUi: greekUi === true,
        powerCap: POWER_CAPS.find((c) => c === powerCap) ?? 'full',
        country: typeof country === 'string' ? country : null,
        disclaimerAccepted: typeof disclaimer === 'number',
      });
      const report = await ipc.contentReconcile((p) => {
        set({ verifying: p });
      });
      set({ verifying: null, reconcile: report });
      await get().refresh();
      set({ status: 'ready' });
    } catch (e) {
      set({ status: 'error', verifying: null, error: e instanceof Error ? e.message : String(e) });
    }
  },
  async refresh() {
    const state = await ipc.contentState();
    const archives = await ipc.zimOpenInstalled();
    set({ root: state.root, catalog: state.catalog, packs: state.packs, archives });
  },
  setBlackout(on) {
    set({ blackout: on });
    persist('blackout.enabled', on);
    // Blackout mode: the model is unloaded on entry (AI on request only).
    if (on) void llama.unload().catch(() => undefined);
  },
  setSimulateT1(on) {
    set({ simulateT1: on });
    persist('dev.simulateT1', on);
    void llama.unload().catch(() => undefined);
  },
  setGreekUi(on) {
    set({ greekUi: on });
    persist('dev.greekUi', on);
  },
  setPowerCap(cap) {
    set({ powerCap: cap });
    persist('desktop.aiPowerCap', cap);
    void llama.unload().catch(() => undefined);
  },
}));

export const knowledge = createKnowledge();
export const llama = new DesktopLlama((modelId) => installedModels(useApp.getState().packs).find((m) => m.id === modelId)?.packId ?? null);

/** Verified GGUF packs; the id is the file name (it selects the tokenizer profile in core). */
export function installedModels(packs: readonly PackRow[]): DesktopModel[] {
  return packs
    .filter((p) => p.kind === 'gguf' && p.verified)
    .map((p) => ({ id: p.path.split(/[\\/]/).pop() ?? p.id, path: p.path, sizeBytes: p.sizeBytes, packId: p.id }));
}

/** The newest verified pack of a kind (only verified maps and places ever open). */
export function newestVerified(packs: readonly PackRow[], kind: 'pmtiles' | 'places'): PackRow[] {
  return packs.filter((p) => p.kind === kind && p.verified).sort((a, b) => b.version.localeCompare(a.version) || a.id.localeCompare(b.id));
}

export function ragArchives(archives: readonly OpenArchive[]): ArchiveRef[] {
  return archives.map((a) => ({ archiveId: a.archiveId, language: a.language }));
}

export interface ActiveProfile {
  profile: InferenceProfile;
  model: DesktopModel | null;
}

/** Desktop inference profile (T3 with a GPU or 16 GB+), then the user's AI power cap. */
export function activeProfile(s: Pick<AppState, 'device' | 'packs' | 'simulateT1' | 'powerCap'>): ActiveProfile {
  const models = installedModels(s.packs);
  const gpu = s.device?.gpu ? { name: s.device.gpu.description, vramMb: s.device.gpu.integrated ? 0 : s.device.gpu.vramMb } : null;
  const base = resolveDesktopProfile({ totalRamMb: s.device?.snapshot.totalRamMb ?? 0, cpu: s.device?.cpu ?? null, gpu, models, simulateT1: s.simulateT1 });
  let profile = base;
  if (s.powerCap === 'balanced') profile = { ...base, load: { ...base.load, threads: Math.max(1, Math.ceil(base.load.threads / 2)) } };
  if (s.powerCap === 'low') profile = { ...base, summaryMode: 'on-demand', load: { ...base.load, threads: Math.min(2, base.load.threads), gpuLayers: 0 } };
  if (s.powerCap === 'off') profile = { ...base, modelId: null };
  return { profile, model: models.find((m) => m.id === profile.modelId) ?? null };
}

export function useActiveProfile(): ActiveProfile {
  const device = useApp((s) => s.device);
  const packs = useApp((s) => s.packs);
  const simulateT1 = useApp((s) => s.simulateT1);
  const powerCap = useApp((s) => s.powerCap);
  return activeProfile({ device, packs, simulateT1, powerCap });
}

export function ragConfigFor(profile: InferenceProfile): Partial<RagConfig> {
  return { tier: profile.budgetTier, modelId: profile.modelId, contextSize: profile.load.contextSize };
}
