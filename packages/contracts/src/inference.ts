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
}

export interface LoadedModel {
  modelId: string;
  contextSize: number;
  loadMs: number;
  description: string;
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
  generatedTokens: number;
  timeToFirstTokenMs: number | null;
  tokensPerSecond: number | null;
  stopReason: StopReason;
}

export interface InferenceEngine {
  load(model: InstalledModel, opts: LoadOptions): Promise<LoadedModel>;
  generate(req: GenerateRequest, onToken: (t: string) => void, signal: AbortSignal): Promise<GenerateResult>;
  embed?(texts: string[]): Promise<Float32Array[]>;
  unload(): Promise<void>;
}
