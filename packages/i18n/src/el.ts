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
    noSource: 'Δεν βρέθηκε σχετική πηγή',
    noSourceDetail: ({ reason, coverage }) => `Λόγος: ${reason} · κάλυψη ${coverage} · χωρίς παραγωγή απάντησης`,
    writing: (chars) => `Γράφεται… (${chars} χαρακτήρες JSON)`,
    unverified: 'Χωρίς επαλήθευση (καμία έγκυρη παραπομπή)',
    notCovered: 'Το μοντέλο δήλωσε ότι οι πηγές δεν καλύπτουν την ερώτηση.',
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
      'Επιβάλλει το προφίλ T1 (μοντέλο T1, 2 νήματα, context 2048, προϋπολογισμός T1) στο Ρώτα και στο bench.',
    profile: ({ tier, mode, model, threads, contextSize, budgetTokens }) =>
      `Κατηγορία ${tier} · λειτουργία ${mode} · ${model} · ${threads} νήματα · n_ctx ${contextSize} · προϋπολογισμός ${budgetTokens} tokens`,
    gate: ({ result, name, value, limit }) =>
      `${result === 'none' ? '–' : result === 'pass' ? 'PASS' : 'FAIL'} ${name}: ${value} (όριο < ${limit})`,
  },
};
