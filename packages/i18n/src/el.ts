import type { Messages } from './messages';

export const el: Messages = {
  common: {
    loading: 'Φόρτωση…',
    error: (message) => `Σφάλμα: ${message}`,
  },
  tabs: {
    search: 'Αναζήτηση',
    ask: 'Ρώτα',
    map: 'Χάρτης',
    bench: 'Bench',
  },
  content: {
    opening: 'Άνοιγμα περιεχομένου…',
    missing: 'Δεν βρέθηκε αρχείο ZIM. Τρέξε το scripts/provision.ps1.',
  },
  search: {
    placeholder: 'Αναζήτηση άρθρων',
    fullText: 'Πλήρες κείμενο',
    timing: ({ kind, count, totalMs, nativeMs }) =>
      `${kind}: ${count} ${count === 1 ? 'αποτέλεσμα' : 'αποτελέσματα'} · ${totalMs} ms (native ${nativeMs} ms)`,
  },
  article: {
    title: 'Άρθρο',
    opened: (ms) => `Άνοιξε σε ${ms} ms`,
    blockedRequests: (count) => `Μπλοκαρισμένα αιτήματα: ${count ?? '…'}`,
    externalLink: (url) => `Εξωτερικός σύνδεσμος (δεν ανοίγει): ${url}`,
  },
  ask: {
    placeholder: 'Ρώτα κάτι (απαντά μόνο από πηγές)',
    submit: 'Ρώτα',
    stop: 'Διακοπή',
    clear: 'Καθαρισμός',
    phase: {
      idle: 'αναμονή',
      'loading-model': 'φόρτωση μοντέλου',
      retrieving: 'αναζήτηση πηγών',
      generating: 'σύνταξη απάντησης',
      done: 'ολοκληρώθηκε',
      error: 'σφάλμα',
    },
    noModel: 'Δεν βρέθηκε μοντέλο GGUF: μόνο αναζήτηση πηγών.',
    emergencyCall: (number) => `Έκτακτη ανάγκη; Κάλεσε ${number}`,
    emergencyServices: ({ ambulance, fire, police }) =>
      `Ασθενοφόρο ${ambulance} · Πυροσβεστική ${fire} · Αστυνομία ${police}`,
    emergencyTopics: (topics) => `Θέματα: ${topics}`,
    medicalNotice: (number) => `Ιατρική ερώτηση. Σε έκτακτη ανάγκη κάλεσε ${number}. Διάβασε πρώτα τις πηγές.`,
    noSource: 'Δεν βρέθηκε σχετική πηγή',
    noSourceDetail: ({ reason, coverage }) => `Λόγος: ${reason} · κάλυψη ${coverage} · χωρίς παραγωγή απάντησης`,
    fromSources: 'Από τις πηγές',
    sourceLabel: ({ id, title, heading }) => `[${id}] ${heading ? `${title} — ${heading}` : title}`,
    summarise: 'Σύνοψη με AI',
    summariseMedical: 'Εμφάνιση μη επαληθευμένης σύνοψης AI',
    writing: 'Γράφεται η σύνοψη AI…',
    aiLabel: 'Σύνοψη AI — έλεγξε την πηγή',
    unverifiedAiLabel: 'Μη επαληθευμένη σύνοψη AI — έλεγξε την πηγή',
    summaryHidden: 'Καμία σύνοψη AI: καμία πρότασή της δεν στηριζόταν στις πηγές.',
    summaryNotCovered: 'Καμία σύνοψη AI: το AI δεν βρήκε απάντηση σε αυτές τις πηγές.',
    sources: 'Πηγές',
    simulationActive: 'Η προσομοίωση T1 είναι ενεργή',
  },
  map: {
    missing: 'Δεν βρέθηκε αρχείο .pmtiles στο maps/.',
    failed: 'Αποτυχία φόρτωσης χάρτη',
    loading: 'Φόρτωση χάρτη…',
    ready: (ms) => `Χάρτης έτοιμος (${ms} ms) · offline PMTiles`,
  },
  bench: {
    run: 'Εκτέλεση bench',
    running: 'Εκτελείται…',
    status: { idle: 'αναμονή', running: 'εκτελείται', done: 'ολοκληρώθηκε', error: 'σφάλμα' },
    developer: 'Προγραμματιστής',
    t1Simulation: 'Προσομοίωση T1',
    t1SimulationHint:
      'Επιβάλλει το προφίλ T1 (μοντέλο T1, 2 νήματα, context 2048, προϋπολογισμός T1, σύνοψη AI κατ’ απαίτηση) στο Ρώτα και στο bench.',
    profile: ({ tier, mode, model, threads, contextSize, budget, summary, backend }) =>
      `Κατηγορία ${tier} · λειτουργία ${mode} · ${model} · ${threads} νήματα · n_ctx ${contextSize} · προϋπολογισμός ${budget} · σύνοψη ${summary} · ${backend}`,
    backend: 'Backend εκτέλεσης (πείραμα)',
    backendHint: 'GPU/NPU μέσω llama.rn, μόνο για μετρήσεις. Προεπιλογή η CPU· χρειάζεται build με ενεργό το πείραμα.',
    backendOption: { cpu: 'CPU', opencl: 'GPU (OpenCL)', hexagon: 'NPU (Hexagon)' },
    gate: ({ result, name, value, limit }) =>
      `${result === 'none' ? '–' : result === 'pass' ? 'PASS' : 'FAIL'} ${name}: ${value} (όριο < ${limit})`,
  },
};
