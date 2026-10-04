import type { Messages } from './messages';

export const en: Messages = {
  common: {
    loading: 'Loading…',
    error: (message) => `Error: ${message}`,
  },
  tabs: {
    search: 'Search',
    ask: 'Ask',
    map: 'Map',
    bench: 'Bench',
  },
  content: {
    opening: 'Opening content…',
    missing: 'No ZIM file found. Run scripts/provision.ps1.',
  },
  search: {
    placeholder: 'Search articles',
    fullText: 'Full-text',
    timing: ({ kind, count, totalMs, nativeMs }) =>
      `${kind}: ${count} ${count === 1 ? 'result' : 'results'} · ${totalMs} ms (native ${nativeMs} ms)`,
  },
  article: {
    title: 'Article',
    opened: (ms) => `Opened in ${ms} ms`,
    blockedRequests: (count) => `Blocked requests: ${count ?? '…'}`,
    externalLink: (url) => `External link (not opened): ${url}`,
  },
  ask: {
    placeholder: 'Ask something (answers only from sources)',
    submit: 'Ask',
    stop: 'Stop',
    clear: 'Clear',
    phase: {
      idle: 'idle',
      'loading-model': 'loading model',
      retrieving: 'searching sources',
      generating: 'writing answer',
      done: 'done',
      error: 'error',
    },
    noModel: 'No GGUF model found: source search only.',
    emergencyCall: (number) => `Emergency? Call ${number}`,
    emergencyServices: ({ ambulance, fire, police }) => `Ambulance ${ambulance} · Fire ${fire} · Police ${police}`,
    emergencyTopics: (topics) => `Topics: ${topics}`,
    medicalNotice: (number) => `Medical question. In an emergency call ${number}. Read the sources first.`,
    noSource: 'No relevant source found',
    noSourceDetail: ({ reason, coverage }) => `Reason: ${reason} · coverage ${coverage} · no generation`,
    fromSources: 'From the sources',
    sourceLabel: ({ id, title, heading }) => `[${id}] ${heading ? `${title} — ${heading}` : title}`,
    summarise: 'Summarise with AI',
    summariseMedical: 'Show unverified AI summary',
    writing: 'Writing the AI summary…',
    aiLabel: 'AI summary — check the source',
    unverifiedAiLabel: 'Unverified AI summary — check the source',
    summaryHidden: 'No AI summary: none of its sentences was supported by the sources.',
    summaryNotCovered: 'No AI summary: the AI found no answer in these sources.',
    sources: 'Sources',
    simulationActive: 'T1 simulation is on',
  },
  map: {
    missing: 'No .pmtiles file found in maps/.',
    failed: 'Map failed to load',
    loading: 'Loading map…',
    ready: (ms) => `Map ready (${ms} ms) · offline PMTiles`,
  },
  bench: {
    run: 'Run bench',
    running: 'Running…',
    status: { idle: 'idle', running: 'running', done: 'done', error: 'error' },
    developer: 'Developer',
    t1Simulation: 'T1 simulation',
    t1SimulationHint:
      'Forces the T1 profile (T1 model, 2 threads, context 2048, T1 budget, AI summary on request) for Ask and the bench.',
    profile: ({ tier, mode, model, threads, contextSize, budget, summary, backend }) =>
      `Tier ${tier} · mode ${mode} · ${model} · ${threads} threads · n_ctx ${contextSize} · budget ${budget} · summary ${summary} · ${backend}`,
    backend: 'Inference backend (experiment)',
    backendHint: 'GPU/NPU through llama.rn, for measurements only. CPU is the default; needs a build with the experiment enabled.',
    backendOption: { cpu: 'CPU', opencl: 'GPU (OpenCL)', hexagon: 'NPU (Hexagon)' },
    gate: ({ result, name, value, limit }) =>
      `${result === 'none' ? '–' : result === 'pass' ? 'PASS' : 'FAIL'} ${name}: ${value} (gate < ${limit})`,
  },
};
