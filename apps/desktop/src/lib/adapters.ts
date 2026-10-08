/**
 * `@skepi/contracts` implemented over the narrow Tauri commands. `@skepi/core` (RAG, catalog,
 * suggestions, places, transfer manifest) runs unchanged on top of these, as on mobile.
 */
import type {
  Article,
  ArchiveInfo,
  ArticleText,
  CatalogEntry,
  ContentStore,
  DeviceProfile,
  DeviceSnapshot,
  DownloadProgress,
  GenerateRequest,
  GenerateResult,
  InferenceEngine,
  InstalledModel,
  InstalledPack,
  KnowledgeEngine,
  LoadedModel,
  LoadOptions,
  PackFile,
  SearchHit,
  SearchOptions,
  VerifyResult,
} from '@skepi/contracts';
import { ipc, type DownloadProgressJson, type PackRow } from './ipc';

export interface DesktopKnowledge extends KnowledgeEngine {
  readonly lastNativeMs: { search: number; suggest: number };
}

/** KnowledgeEngine over libzim (crates/zim-ffi). Archives are opened by the native side from app.db. */
export function createKnowledge(): DesktopKnowledge {
  const lastNativeMs = { search: 0, suggest: 0 };
  return {
    lastNativeMs,
    openArchive(file: PackFile): Promise<ArchiveInfo> {
      // Archives open together from the installed, verified (or consented) packs: zim_open_installed.
      return Promise.reject(new Error(`${file.packId}: the desktop opens archives by pack id (zim_open_installed)`));
    },
    async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
      const ids = opts.archiveIds ? [...opts.archiveIds] : null;
      if (opts.mode === 'suggest') {
        const r = await ipc.zimSuggest(query, opts.limit, ids);
        lastNativeMs.suggest = r.nativeMs;
        return r.hits;
      }
      const r = await ipc.zimSearch(query, opts.limit, ids);
      lastNativeMs.search = r.nativeMs;
      return r.hits;
    },
    async getArticle(archiveId: string, path: string): Promise<Article> {
      const a = await ipc.zimArticle(archiveId, path);
      return { archiveId: a.archiveId, path: a.path, title: a.title, mimeType: a.mimeType, html: a.html };
    },
    async getPlainText(archiveId: string, path: string): Promise<ArticleText> {
      const t = await ipc.zimPlainText(archiveId, path);
      return { archiveId: t.archiveId, path: t.path, title: t.title, sections: t.sections };
    },
    async closeArchive(): Promise<void> {
      // Archives close together when the installed set changes (zim_open_installed).
    },
  };
}

/**
 * InferenceEngine over llama.cpp in the app process (Vulkan or CPU). `InstalledModel.id` is the model
 * file name (it selects the tokenizer profile in core); `packIdOf` maps it to the installed pack.
 */
export class DesktopLlama implements InferenceEngine {
  private loaded: LoadedModel | null = null;
  private key: string | null = null;

  constructor(private readonly packIdOf: (modelId: string) => string | null) {}

  get current(): LoadedModel | null {
    return this.loaded;
  }

  async load(model: InstalledModel, opts: LoadOptions, onProgress?: (fraction: number) => void): Promise<LoadedModel> {
    const key = `${model.id}|${String(opts.contextSize)}|${String(opts.threads)}|${String(opts.gpuLayers)}`;
    if (this.loaded && this.key === key) {
      onProgress?.(1);
      return this.loaded;
    }
    const packId = this.packIdOf(model.id);
    if (!packId) throw new Error(`model ${model.id} is not installed`);
    if (this.key !== null && this.key !== key) await ipc.llmUnload();
    const native = await ipc.llmLoad(
      packId,
      { contextSize: opts.contextSize, threads: opts.threads, useMmap: opts.useMmap, useMlock: opts.useMlock, gpuLayers: opts.gpuLayers },
      (f) => onProgress?.(f),
    );
    this.key = key;
    this.loaded = {
      modelId: model.id,
      contextSize: native.contextSize,
      loadMs: native.loadMs,
      description: native.description,
      gpu: native.gpu,
      devices: native.devices,
      reasonNoGpu: native.reasonNoGpu,
    };
    return this.loaded;
  }

  async generate(req: GenerateRequest, onToken: (t: string) => void, signal: AbortSignal): Promise<GenerateResult> {
    const onAbort = (): void => {
      void ipc.llmAbort();
    };
    signal.addEventListener('abort', onAbort);
    try {
      const r = await ipc.llmGenerate(
        { messages: req.messages, maxTokens: req.maxTokens, temperature: req.temperature, stop: req.stop ?? [], jsonSchema: req.jsonSchema ?? null },
        onToken,
      );
      return { ...r, stopReason: signal.aborted ? 'abort' : r.stopReason };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async unload(): Promise<void> {
    this.loaded = null;
    this.key = null;
    await ipc.llmUnload();
  }
}

export function toInstalled(p: PackRow): InstalledPack {
  return {
    id: p.id,
    kind: p.kind,
    version: p.version,
    title: p.title,
    path: p.path,
    sizeBytes: p.sizeBytes,
    sha256: p.sha256,
    verified: p.verified,
    source: p.source,
    consentAt: p.consentAt,
    license: p.license,
  };
}

/** ContentStore over the Rust downloader (the app's only internet use) and its import rules. */
export const contentStore: ContentStore = {
  async listInstalled() {
    return (await ipc.contentState()).packs.map(toInstalled);
  },
  download(entry: CatalogEntry, signal: AbortSignal): AsyncIterable<DownloadProgress> {
    const queue: DownloadProgress[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: Error | null = null;
    const push = (p: DownloadProgressJson): void => {
      queue.push(p);
      wake?.();
    };
    const onAbort = (): void => {
      void ipc.contentCancel(entry.id);
    };
    signal.addEventListener('abort', onAbort);
    ipc.contentDownload(entry.id, push).then(
      () => {
        finished = true;
        wake?.();
      },
      (e: unknown) => {
        failure = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'download failed');
        finished = true;
        wake?.();
      },
    );
    return {
      async *[Symbol.asyncIterator]() {
        try {
          for (;;) {
            const next = queue.shift();
            if (next) {
              yield next;
              continue;
            }
            if (finished) break;
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = null;
          }
          if (failure !== null && !signal.aborted) throw failure;
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      },
    };
  },
  async importFile() {
    // The native file picker chooses the file (the webview never names a path).
    const row = await ipc.contentImport(() => undefined);
    if (!row) throw new Error('cancelled');
    return toInstalled(row);
  },
  async verify(pack: InstalledPack): Promise<VerifyResult> {
    return ipc.contentVerify(pack.id);
  },
  async remove(packId: string) {
    await ipc.contentRemove(packId);
  },
};

export const deviceProfile: DeviceProfile = {
  async snapshot(): Promise<DeviceSnapshot> {
    return (await ipc.deviceInfo()).snapshot;
  },
};
