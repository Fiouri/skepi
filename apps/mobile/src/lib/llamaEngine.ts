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

/** InferenceEngine adapter over llama.rn (llama.cpp; CPU on Android unless a GPU/NPU experiment is on). */
export class LlamaEngine implements InferenceEngine {
  private ctx: LlamaContext | null = null;
  private loaded: LoadedModel | null = null;
  private loading: Promise<LoadedModel> | null = null;
  private loadedOpts: string | null = null;
  private prewarmed: string | null = null;

  get current(): LoadedModel | null {
    return this.loaded;
  }

  get tokenizer(): LlamaContext | null {
    return this.ctx;
  }

  async load(model: InstalledModel, opts: LoadOptions, onProgress?: (fraction: number) => void): Promise<LoadedModel> {
    const key = JSON.stringify(opts);
    if (this.loaded?.modelId === model.id && this.loadedOpts === key) {
      onProgress?.(1);
      return this.loaded;
    }
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
        // n_parallel is left at the llama.rn default: n_parallel=1 crashed llama.cpp in
        // llama_kv_cache::cpy_k (SIGSEGV) on llama.rn 0.12.9 during the spike.
        ...(opts.cpuAffinity && opts.cpuAffinity.length > 0
          ? { cpu_mask: opts.cpuAffinity.join(','), cpu_strict: true }
          : {}),
        ...(opts.flashAttention === undefined ? {} : { flash_attn_type: opts.flashAttention ? 'on' : 'off' }),
        ...(opts.devices && opts.devices.length > 0 ? { devices: [...opts.devices] } : {}),
      }, (percent) => {
        // llama.rn reports 0–100 while the weights are mapped and the context is created.
        onProgress?.(Math.max(0, Math.min(1, percent / 100)));
      });
      this.ctx = ctx;
      this.loadedOpts = key;
      this.prewarmed = null;
      this.loaded = {
        modelId: model.id,
        contextSize: opts.contextSize,
        loadMs: Date.now() - start,
        description: `${ctx.model.desc} · lib ${ctx.androidLib ?? 'n/a'}`,
        gpu: ctx.gpu,
        devices: ctx.devices ?? [],
        reasonNoGpu: ctx.reasonNoGPU,
      };
      return this.loaded;
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Prefills the fixed system prompt once per loaded model. llama.rn keeps the KV cache of the last
   * request and reuses its longest common token prefix, so every later question starts after the
   * system prompt. Returns the prefill time (0 when already warm).
   */
  async prewarm(systemPrompt: string): Promise<number> {
    const ctx = this.ctx;
    if (!ctx || this.prewarmed === systemPrompt) return 0;
    const start = Date.now();
    await ctx.completion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '' },
      ],
      n_predict: 1,
      temperature: 0,
      enable_thinking: false,
      add_generation_prompt: true,
    });
    this.prewarmed = systemPrompt;
    return Date.now() - start;
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
          // Without this llama.rn's JSON-schema path left the assistant header out of the prompt and
          // the model generated "<|im_start|>assistant" itself.
          add_generation_prompt: true,
          ...(req.stop ? { stop: req.stop } : {}),
          ...(req.jsonSchema
            ? { response_format: { type: 'json_schema' as const, json_schema: { strict: true, schema: req.jsonSchema } } }
            : {}),
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
        // tokens_evaluated = whole prompt; timings.prompt_n = prompt tokens actually decoded this
        // request. The difference was served from the KV cache (llama.rn's tokens_cached is n_past
        // after generation, not the reused prefix).
        promptTokens: res.tokens_evaluated,
        cachedPromptTokens: Math.max(0, res.tokens_evaluated - res.timings.prompt_n),
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
    this.loadedOpts = null;
    this.prewarmed = null;
    if (ctx) await ctx.release();
  }
}
