/**
 * Every user-visible UI string. English is the master; each locale implements the same shape, so a
 * missing or extra key is a type error. Values with parameters are functions (no runtime templating).
 */
export interface Messages {
  common: {
    loading: string;
    error: (message: string) => string;
  };
  tabs: {
    search: string;
    ask: string;
    map: string;
    bench: string;
  };
  content: {
    opening: string;
    missing: string;
  };
  search: {
    placeholder: string;
    fullText: string;
    timing: (p: { kind: 'suggest' | 'fulltext'; count: number; totalMs: string; nativeMs: string }) => string;
  };
  article: {
    title: string;
    opened: (ms: string) => string;
    blockedRequests: (count: number | null) => string;
    externalLink: (url: string) => string;
  };
  ask: {
    placeholder: string;
    submit: string;
    stop: string;
    clear: string;
    phase: Record<'idle' | 'loading-model' | 'retrieving' | 'generating' | 'done' | 'error', string>;
    noModel: string;
    emergencyCall: (number: string) => string;
    emergencyServices: (n: { ambulance: string; fire: string; police: string }) => string;
    emergencyTopics: (topics: string) => string;
    noSource: string;
    noSourceDetail: (p: { reason: string; coverage: string }) => string;
    writing: (chars: number) => string;
    unverified: string;
    notCovered: string;
    sources: string;
    simulationActive: string;
  };
  map: {
    missing: string;
    failed: string;
    loading: string;
    ready: (ms: string) => string;
  };
  bench: {
    run: string;
    running: string;
    status: Record<'idle' | 'running' | 'done' | 'error', string>;
    developer: string;
    t1Simulation: string;
    t1SimulationHint: string;
    profile: (p: { tier: string; mode: string; model: string; threads: number; contextSize: number; budgetTokens: number }) => string;
    gate: (p: { result: 'pass' | 'fail' | 'none'; name: string; value: string; limit: number }) => string;
  };
}
