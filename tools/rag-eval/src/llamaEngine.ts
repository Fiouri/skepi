import type { GenerateRequest, GenerateResult, InferenceEngine, InstalledModel, LoadedModel, LoadOptions, StopReason } from '@skepi/contracts';
import {
  getLlama,
  LlamaChatSession,
  type GbnfJsonSchema,
  type Llama,
  type LlamaContext,
  type LlamaContextSequence,
  type LlamaGrammar,
  type LlamaModel,
} from 'node-llama-cpp';

type NoDefs = Record<string, never>;
type NoDefsSchema = GbnfJsonSchema<NoDefs>;

/** Fixed sampling seed: eval runs are reproducible (the app samples with llama.rn's default seed). */
const EVAL_SEED = 42;

/**
 * InferenceEngine over node-llama-cpp on CPU. The prompts, JSON schema and post-validation come
 * from @skepi/core unchanged; only the binding differs from the app (llama.rn). Like llama.rn, the
 * context sequence keeps its KV cache between requests and reuses the common token prefix.
 */
export class NodeLlamaEngine implements InferenceEngine {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private sequence: LlamaContextSequence | null = null;
  private readonly grammars = new Map<string, LlamaGrammar>();

  async load(model: InstalledModel, opts: LoadOptions): Promise<LoadedModel> {
    const start = Date.now();
    this.llama = await getLlama({ gpu: false, maxThreads: opts.threads });
    this.model = await this.llama.loadModel({ modelPath: model.path, gpuLayers: 0, useMmap: opts.useMmap, useMlock: opts.useMlock });
    this.context = await this.model.createContext({ contextSize: opts.contextSize, threads: opts.threads, sequences: 1 });
    this.sequence = this.context.getSequence();
    return {
      modelId: model.id,
      contextSize: opts.contextSize,
      loadMs: Date.now() - start,
      description: `${this.model.filename ?? model.id} · node-llama-cpp CPU · ${opts.threads} threads`,
      gpu: false,
      devices: [],
      reasonNoGpu: 'CPU only (rag-eval)',
    };
  }

  /** Token count of a text with the model's real tokenizer. */
  tokenize(text: string): number {
    if (!this.model) throw new Error('model not loaded');
    return this.model.tokenize(text).length;
  }

  private async grammar(schema: Readonly<Record<string, unknown>>): Promise<LlamaGrammar> {
    if (!this.llama) throw new Error('model not loaded');
    const key = JSON.stringify(schema);
    const cached = this.grammars.get(key);
    if (cached) return cached;
    // The schema comes from @skepi/core (answerJsonSchema) and only uses keywords node-llama-cpp supports.
    const created = await this.llama.createGrammarForJsonSchema<NoDefsSchema, NoDefs>(schema as NoDefsSchema);
    this.grammars.set(key, created);
    return created;
  }

  async generate(req: GenerateRequest, onToken: (t: string) => void, signal: AbortSignal): Promise<GenerateResult> {
    const sequence = this.sequence;
    if (!sequence) throw new Error('model not loaded');
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const user = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const grammar = req.jsonSchema ? await this.grammar(req.jsonSchema) : undefined;

    const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: system, autoDisposeSequence: false });
    const inputBefore = sequence.tokenMeter.usedInputTokens;
    const outputBefore = sequence.tokenMeter.usedOutputTokens;
    const start = Date.now();
    // Set from the streaming callback; an object so control-flow analysis sees the assignment.
    const first: { at: number | null } = { at: null };
    try {
      const res = await session.promptWithMeta(user, {
        maxTokens: req.maxTokens,
        temperature: req.temperature,
        seed: EVAL_SEED,
        signal,
        stopOnAbortSignal: true,
        ...(grammar ? { grammar } : {}),
        onTextChunk: (chunk) => {
          first.at ??= Date.now();
          onToken(chunk);
        },
      });
      const elapsed = Date.now() - start;
      const generatedTokens = sequence.tokenMeter.usedOutputTokens - outputBefore;
      const evaluated = sequence.tokenMeter.usedInputTokens - inputBefore;
      const promptTokens = Math.max(0, sequence.contextTokens.length - generatedTokens);
      const decodeMs = first.at === null ? 0 : elapsed - (first.at - start);
      const stopReason: StopReason =
        res.stopReason === 'abort' ? 'abort' : res.stopReason === 'maxTokens' ? 'limit' : res.stopReason === 'eogToken' ? 'eos' : 'stop';
      return {
        text: res.responseText,
        promptTokens,
        cachedPromptTokens: Math.max(0, promptTokens - evaluated),
        generatedTokens,
        timeToFirstTokenMs: first.at === null ? null : first.at - start,
        tokensPerSecond: decodeMs > 0 ? (generatedTokens / decodeMs) * 1000 : null,
        stopReason,
      };
    } finally {
      session.dispose({ disposeSequence: false });
    }
  }

  async unload(): Promise<void> {
    await this.context?.dispose();
    await this.model?.dispose();
    this.context = null;
    this.model = null;
    this.sequence = null;
    this.grammars.clear();
  }
}
