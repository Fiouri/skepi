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
    library: string;
    bench: string;
  };
  content: {
    opening: string;
    missing: string;
    verifying: (p: { file: string; percent: number }) => string;
  };
  /** Permanent label of content that matched no signed catalog entry. */
  unverified: {
    label: string;
    consentTitle: string;
    consentBody: (title: string) => string;
    consentAccept: string;
    cancel: string;
  };
  library: {
    catalog: (p: { sequence: number; keys: string; packs: number }) => string;
    noCatalog: string;
    catalogRejected: (p: { origin: string; reason: string }) => string;
    checkUpdate: string;
    updated: (sequence: number) => string;
    upToDate: (sequence: number) => string;
    updateRejected: (reason: string) => string;
    allowMetered: string;
    allowMeteredHint: string;
    installed: string;
    available: string;
    none: string;
    size: (size: string) => string;
    licence: (licence: string) => string;
    verified: string;
    download: string;
    cancel: string;
    remove: string;
    verify: string;
    verifyOk: string;
    verifyFailed: string;
    import: string;
    importing: string;
    imported: (title: string) => string;
    importRejected: (reason: string) => string;
    open: string;
    phase: Record<'queued' | 'waiting-for-network' | 'downloading' | 'verifying' | 'installing' | 'done' | 'failed' | 'cancelled', string>;
    progress: (p: { phase: string; percent: number; mirror: number; rejected: number }) => string;
    failed: (reason: string) => string;
    meteredTitle: string;
    meteredBody: (size: string) => string;
    meteredAccept: string;
    noSpace: (p: { needed: string; free: string }) => string;
    rejectedModels: (files: string) => string;
    networkLog: (p: { count: number; hosts: string }) => string;
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
    /** Model load progress, 0–100. */
    loadingModel: (percent: number) => string;
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
    parity: string;
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
