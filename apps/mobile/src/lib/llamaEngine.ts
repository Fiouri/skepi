import type {
  GenerateRequest,
  GenerateResult,
  InferenceEngine,
  InstalledModel,
  LoadedModel,
  LoadOptions,
  StopReason,
} from '@skepi/contracts';
import { initLlama, type LlamaContext } from 'llama.rn';

/** InferenceEngine adapter over llama.rn (llama.cpp, CPU on Android). */
export class LlamaEngine implements InferenceEngine {
  private ctx: LlamaContext | null = null;
  private loaded: LoadedModel | null = null;
  private loading: Promise<LoadedModel> | null = null;

  get current(): LoadedModel | null {
    return this.loaded;
  }

  get tokenizer(): LlamaContext | null {
    return this.ctx;
  }

  async load(model: InstalledModel, opts: LoadOptions): Promise<LoadedModel> {
    if (this.loaded?.modelId === model.id) return this.loaded;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      await this.unload();
      const start = Date.now();
      const ctx = await initLlama({
        model: model.path,
        n_ctx: opts.contextSize,
        n_threads: opts.threads,
        n_gpu_layers: opts.gpuLayers,
        use_mmap: opts.useMmap,
        use_mlock: opts.useMlock,
      });
      this.ctx = ctx;
      this.loaded = {
        modelId: model.id,
        contextSize: opts.contextSize,
        loadMs: Date.now() - start,
        description: `${ctx.model.desc} · lib ${ctx.androidLib ?? 'n/a'}`,
      };
      return this.loaded;
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async generate(req: GenerateRequest, onToken: (t: string) => void, signal: AbortSignal): Promise<GenerateResult> {
    const ctx = this.ctx;
    if (!ctx) throw new Error('Model not loaded');
    const onAbort = (): void => {
      void ctx.stopCompletion();
    };
    signal.addEventListener('abort', onAbort);
    const start = Date.now();
    const first: { at: number | null } = { at: null };
    try {
      const res = await ctx.completion(
        {
          messages: req.messages,
          n_predict: req.maxTokens,
          temperature: req.temperature,
          enable_thinking: false,
          ...(req.stop ? { stop: req.stop } : {}),
        },
        (data) => {
          first.at ??= Date.now();
          onToken(data.token);
        },
      );
      const stopReason: StopReason = res.interrupted || signal.aborted
        ? 'abort'
        : res.stopped_eos
          ? 'eos'
          : res.stopped_limit > 0
            ? 'limit'
            : 'stop';
      return {
        text: res.text,
        promptTokens: res.timings.prompt_n,
        generatedTokens: res.timings.predicted_n,
        timeToFirstTokenMs: first.at === null ? null : first.at - start,
        tokensPerSecond: Number.isFinite(res.timings.predicted_per_second) ? res.timings.predicted_per_second : null,
        stopReason,
      };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async unload(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    this.loaded = null;
    if (ctx) await ctx.release();
  }
}
