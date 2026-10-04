import type { InstalledModel } from '@skepi/contracts';
import { resolveInferenceProfile, type InferenceProfile } from '@skepi/core';
import { ExpoDeviceProfile, type CpuInfo } from 'expo-device-profile';
import { createZimKnowledgeEngine, ExpoZim, type ZimArchiveInfo, type ZimContentFile, type ZimRuntimeInfo } from 'expo-zim';
import { create } from 'zustand';
import { LlamaEngine } from './llamaEngine';

export const knowledge = createZimKnowledgeEngine();
export const llama = new LlamaEngine();

interface ContentState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  runtime: ZimRuntimeInfo | null;
  files: ZimContentFile[];
  archives: ZimArchiveInfo[];
  models: InstalledModel[];
  pmtilesPath: string | null;
  cpu: CpuInfo | null;
  totalRamMb: number;
  /** Developer setting: force the T1 profile on any device (in memory; resets on restart). */
  simulateT1: boolean;
  setSimulateT1: (on: boolean) => void;
  bootstrap: () => Promise<void>;
}

export const useContent = create<ContentState>((set, get) => ({
  status: 'idle',
  error: null,
  runtime: null,
  files: [],
  archives: [],
  models: [],
  pmtilesPath: null,
  cpu: null,
  totalRamMb: 0,
  simulateT1: false,
  setSimulateT1: (on) => {
    if (get().simulateT1 === on) return;
    set({ simulateT1: on });
    // The loaded model may not match the new profile; the next request reloads it.
    void llama.unload();
  },
  bootstrap: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const runtime = await ExpoZim.getRuntimeInfo();
      const [files, cpu, snapshot] = await Promise.all([
        ExpoZim.listContent(),
        ExpoDeviceProfile.getCpuInfo(),
        ExpoDeviceProfile.getSnapshot(),
      ]);
      const archives: ZimArchiveInfo[] = [];
      for (const f of files.filter((x) => x.kind === 'zim')) {
        archives.push(await ExpoZim.openArchive(f.path));
      }
      const models = files
        .filter((x) => x.kind === 'models' && x.name.endsWith('.gguf'))
        .map((x) => ({ id: x.name, path: x.path, sizeBytes: x.sizeBytes }));
      const pmtiles = files.find((x) => x.kind === 'maps' && x.name.endsWith('.pmtiles'));
      set({
        status: 'ready',
        runtime,
        files,
        archives,
        cpu,
        totalRamMb: snapshot.totalRamMb,
        models,
        pmtilesPath: pmtiles?.path ?? null,
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

export interface ActiveProfile {
  profile: InferenceProfile;
  model: InstalledModel | null;
}

function toActive(state: Pick<ContentState, 'cpu' | 'models' | 'totalRamMb' | 'simulateT1'>): ActiveProfile {
  const profile = resolveInferenceProfile({
    totalRamMb: state.totalRamMb,
    cpu: state.cpu,
    models: state.models,
    simulateT1: state.simulateT1,
  });
  return { profile, model: state.models.find((m) => m.id === profile.modelId) ?? null };
}

/** Inference profile for the current device and developer settings (outside React). */
export function activeProfile(): ActiveProfile {
  return toActive(useContent.getState());
}

/** Inference profile for the current device and developer settings. */
export function useActiveProfile(): ActiveProfile {
  const cpu = useContent((s) => s.cpu);
  const models = useContent((s) => s.models);
  const totalRamMb = useContent((s) => s.totalRamMb);
  const simulateT1 = useContent((s) => s.simulateT1);
  return toActive({ cpu, models, totalRamMb, simulateT1 });
}
