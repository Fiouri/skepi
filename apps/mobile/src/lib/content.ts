import type { InstalledModel, LoadOptions } from '@skepi/contracts';
import { TIER_BUDGET_TOKENS } from '@skepi/core';
import { createZimKnowledgeEngine, ExpoZim, type CpuInfo, type ZimArchiveInfo, type ZimContentFile, type ZimRuntimeInfo } from 'expo-zim';
import { create } from 'zustand';
import { LlamaEngine } from './llamaEngine';

export const knowledge = createZimKnowledgeEngine();
export const llama = new LlamaEngine();

/** T1 inference settings from docs/architecture.md (CPU, mmap on, mlock off). */
export const T1_CONTEXT = 2048;
export const T1_BUDGET = TIER_BUDGET_TOKENS.T1;

interface ContentState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  runtime: ZimRuntimeInfo | null;
  files: ZimContentFile[];
  archives: ZimArchiveInfo[];
  model: InstalledModel | null;
  pmtilesPath: string | null;
  cpu: CpuInfo | null;
  bootstrap: () => Promise<void>;
}

export const useContent = create<ContentState>((set, get) => ({
  status: 'idle',
  error: null,
  runtime: null,
  files: [],
  archives: [],
  model: null,
  pmtilesPath: null,
  cpu: null,
  bootstrap: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const runtime = await ExpoZim.getRuntimeInfo();
      const [files, cpu] = await Promise.all([ExpoZim.listContent(), ExpoZim.getCpuInfo()]);
      const archives: ZimArchiveInfo[] = [];
      for (const f of files.filter((x) => x.kind === 'zim')) {
        archives.push(await ExpoZim.openArchive(f.path));
      }
      const gguf = files.find((x) => x.kind === 'models' && x.name.endsWith('.gguf'));
      const pmtiles = files.find((x) => x.kind === 'maps' && x.name.endsWith('.pmtiles'));
      set({
        status: 'ready',
        runtime,
        files,
        archives,
        cpu,
        model: gguf ? { id: gguf.name, path: gguf.path, sizeBytes: gguf.sizeBytes } : null,
        pmtilesPath: pmtiles?.path ?? null,
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

export function loadOptions(cpu: CpuInfo | null): LoadOptions {
  return {
    contextSize: T1_CONTEXT,
    threads: Math.max(1, cpu?.performanceCores ?? 4),
    useMmap: true,
    useMlock: false,
    gpuLayers: 0,
  };
}
