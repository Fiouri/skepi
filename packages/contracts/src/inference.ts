export interface InstalledModel {
  id: string;
  path: string;
  sizeBytes: number;
}

export interface LoadOptions {
  contextSize: number;
  threads: number;
  useMmap: boolean;
  useMlock: boolean;
  gpuLayers: number;
  /** Pin inference threads to these CPU ids (performance cores); unpinned when omitted. */
  cpuAffinity?: readonly number[];
  /** Flash attention on CPU; engine default when omitted. */
  flashAttention?: boolean;
  /** Backend devices to offload to (e.g. `HTP*` for the Hexagon NPU); engine default when omitted. */
  devices?: readonly string[];
}

export interface LoadedModel {
  modelId: string;
  contextSize: number;
  loadMs: number;
  description: string;
  /** True when layers run on a GPU/NPU backend; `reasonNoGpu` explains a CPU fallback. */
  gpu: boolean;
  devices: string[];
  reasonNoGpu: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  stop?: string[];
  /** Constrains the output to this JSON schema (compiled to a GBNF grammar by the engine). */
  jsonSchema?: Readonly<Record<string, unknown>>;
}

export type StopReason = 'eos' | 'limit' | 'stop' | 'abort';

export interface GenerateResult {
  text: string;
  promptTokens: number;
  /** Prompt tokens served from the KV cache of the previous request (common prefix reuse). */
  cachedPromptTokens: number;
  generatedTokens: number;
  timeToFirstTokenMs: number | null;
  tokensPerSecond: number | null;
  stopReason: StopReason;
}

export interface InferenceEngine {
  /** `onProgress` receives the load progress as a fraction (0–1), for the UI. */
  load(model: InstalledModel, opts: LoadOptions, onProgress?: (fraction: number) => void): Promise<LoadedModel>;
  generate(req: GenerateRequest, onToken: (t: string) => void, signal: AbortSignal): Promise<GenerateResult>;
  embed?(texts: string[]): Promise<Float32Array[]>;
  unload(): Promise<void>;
}
