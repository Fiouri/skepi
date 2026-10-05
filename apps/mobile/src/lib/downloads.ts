import type { CatalogEntry, DownloadProgress } from '@skepi/contracts';
import type { ActiveDownload } from '@skepi/db';
import { create } from 'zustand';
import { contentStore, currentCatalog, useContent } from './content';
import { ContentError } from './contentStore';

export interface DownloadView {
  progress: DownloadProgress | null;
  /** Final outcome text key: installed, failed (with reason) or cancelled. */
  result: { kind: 'done' | 'failed' | 'cancelled'; reason: string | null } | null;
  running: boolean;
}

interface DownloadsState {
  byPack: Record<string, DownloadView>;
  start: (entry: CatalogEntry, allowMetered: boolean, resume?: ActiveDownload) => void;
  cancel: (packId: string) => void;
  /** Picks up system downloads that were running when the app was stopped (resume). */
  resumeActive: () => Promise<void>;
}

const controllers = new Map<string, AbortController>();

export const useDownloads = create<DownloadsState>((set, get) => {
  const update = (packId: string, view: Partial<DownloadView>): void => {
    set((s) => ({
      byPack: { ...s.byPack, [packId]: { progress: null, result: null, running: false, ...s.byPack[packId], ...view } },
    }));
  };

  const run = async (entry: CatalogEntry, allowMetered: boolean, resume?: ActiveDownload): Promise<void> => {
    const controller = new AbortController();
    controllers.set(entry.id, controller);
    update(entry.id, { running: true, result: null, progress: null });
    try {
      for await (const p of contentStore.downloadPack(entry, { signal: controller.signal, allowMetered }, resume)) {
        update(entry.id, { progress: p });
        if (p.phase === 'cancelled') {
          update(entry.id, { result: { kind: 'cancelled', reason: null } });
          return;
        }
        if (p.phase === 'done') update(entry.id, { result: { kind: 'done', reason: null } });
      }
      await useContent.getState().refresh();
    } catch (e) {
      const reason = e instanceof ContentError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
      update(entry.id, { result: { kind: 'failed', reason } });
    } finally {
      controllers.delete(entry.id);
      update(entry.id, { running: false });
    }
  };

  return {
    byPack: {},
    start: (entry, allowMetered, resume) => {
      if (get().byPack[entry.id]?.running) return;
      void run(entry, allowMetered, resume);
    },
    cancel: (packId) => {
      controllers.get(packId)?.abort();
    },
    resumeActive: async () => {
      const catalog = currentCatalog();
      if (!catalog) return;
      for (const active of await contentStore.activeDownloads()) {
        const entry = catalog.packs.find((p) => p.id === active.packId);
        if (entry && !get().byPack[entry.id]?.running) get().start(entry, active.allowMetered, active);
      }
    },
  };
});

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${String(bytes)} B`;
}
