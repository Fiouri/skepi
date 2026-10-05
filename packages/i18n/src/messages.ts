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
    /** Shown first on medical intent, before Layer 1 (emergency cards join it in Phase 1d). */
    medicalNotice: (number: string) => string;
    noSource: string;
    noSourceDetail: (p: { reason: string; coverage: string }) => string;
    /** Layer 1 heading: verbatim passages from the sources. */
    fromSources: string;
    /** Citation chip / passage link: "[S1] Title — Section". */
    sourceLabel: (p: { id: string; title: string; heading: string }) => string;
    /** Layer 1 shows the matching sentences; these toggle the whole passage. */
    showPassage: string;
    hidePassage: string;
    summarise: string;
    summariseMedical: string;
    writing: string;
    /** Fixed label on every AI answer. */
    aiLabel: string;
    /** Fixed label on AI answers to medical questions. */
    unverifiedAiLabel: string;
    summaryHidden: string;
    summaryNotCovered: string;
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
    profile: (p: {
      tier: string;
      mode: string;
      model: string;
      threads: number;
      contextSize: number;
      budget: string;
      summary: string;
      backend: string;
    }) => string;
    backend: string;
    backendHint: string;
    backendOption: Record<'cpu' | 'opencl' | 'hexagon', string>;
    gate: (p: { result: 'pass' | 'fail' | 'none'; name: string; value: string; limit: number }) => string;
  };
}
