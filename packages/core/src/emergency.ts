import { foldText, tokenize } from './text';

export type EmergencyTopic =
  | 'cpr'
  | 'bleeding'
  | 'choking'
  | 'burn'
  | 'poisoning'
  | 'fracture'
  | 'hypothermia'
  | 'heatstroke'
  | 'drowning'
  | 'heart-attack'
  | 'stroke'
  | 'seizure'
  | 'anaphylaxis'
  | 'earthquake'
  | 'fire'
  | 'flood';

export interface EmergencyNumbers {
  general: string;
  ambulance: string;
  fire: string;
  police: string;
}

/** Greece; per-country numbers are fixed in the bundle, never fetched. */
export const EMERGENCY_NUMBERS_GR: EmergencyNumbers = {
  general: '112',
  ambulance: '166',
  fire: '199',
  police: '100',
};

export interface EmergencyMatch {
  topics: EmergencyTopic[];
  /** Lexicon entries that matched (folded form). */
  matched: string[];
  numbers: EmergencyNumbers;
}

/**
 * Entries are folded (lowercase, no accents, σ for final sigma). A trailing `*`
 * means prefix match on a token (Greek inflection); a space means consecutive
 * tokens. Everything else is an exact token match.
 */
const LEXICON: Record<EmergencyTopic, readonly string[]> = {
  cpr: ['καρπα', 'ανακοπ*', 'καρδιοπνευμονικ*', 'αναζωογονησ*', 'cpr', 'cardiac arrest', 'resuscitation', 'unconscious', 'not breathing', 'αναισθητοσ', 'αναισθητη', 'αναισθητο', 'δεν αναπνε*'],
  bleeding: ['αιμορραγ*', 'αιμοραγ*', 'αιματ*', 'bleeding', 'bleed', 'bleeds', 'hemorrhage', 'haemorrhage', 'tourniquet', 'αιμοστατ*'],
  choking: ['πνιγ*', 'πνιξ*', 'ασφυξι*', 'choking', 'choke', 'chokes', 'heimlich'],
  burn: ['εγκαυμ*', 'καψιμ*', 'καηκ*', 'burn', 'burns', 'burned', 'scald'],
  poisoning: ['δηλητηρια*', 'δηλητηριασ*', 'τοξικ*', 'poison', 'poisoning', 'poisoned', 'overdose', 'υπερδοσολογ*'],
  fracture: ['καταγμα*', 'σπασ* οστ*', 'fracture', 'fractured', 'broken bone'],
  hypothermia: ['υποθερμ*', 'κρυοπαγ*', 'hypothermia', 'frostbite'],
  heatstroke: ['θερμοπληξ*', 'ηλιαση*', 'heatstroke', 'heat stroke', 'sunstroke'],
  drowning: ['πνιγμ*', 'drowning', 'drowned', 'drown'],
  'heart-attack': ['εμφραγμ*', 'καρδιακη προσβολη', 'heart attack', 'chest pain', 'πονοσ στο στηθοσ'],
  stroke: ['εγκεφαλικ*', 'stroke'],
  seizure: ['επιληψ*', 'σπασμ*', 'seizure', 'seizures', 'convulsion', 'convulsions'],
  anaphylaxis: ['αναφυλαξ*', 'αλλεργικο σοκ', 'anaphylaxis', 'anaphylactic', 'epipen'],
  earthquake: ['σεισμ*', 'earthquake', 'quake'],
  fire: ['πυρκαγι*', 'φωτια', 'φωτιασ', 'φωτιεσ', 'fire', 'wildfire', 'smoke'],
  flood: ['πλημμυρ*', 'flood', 'flooding', 'flash flood'],
};

function matchesEntry(tokens: readonly string[], entry: string): boolean {
  const parts = entry.split(' ');
  for (let start = 0; start + parts.length <= tokens.length; start += 1) {
    const ok = parts.every((part, offset) => {
      const token = tokens[start + offset];
      if (token === undefined) return false;
      return part.endsWith('*') ? token.startsWith(part.slice(0, -1)) : token === part;
    });
    if (ok) return true;
  }
  return false;
}

/**
 * Deterministic emergency check run before retrieval. Returns null when the
 * question contains no emergency term.
 */
export function detectEmergency(question: string, numbers: EmergencyNumbers = EMERGENCY_NUMBERS_GR): EmergencyMatch | null {
  const tokens = tokenize(foldText(question));
  if (tokens.length === 0) return null;
  const topics: EmergencyTopic[] = [];
  const matched: string[] = [];
  for (const [topic, entries] of Object.entries(LEXICON) as [EmergencyTopic, readonly string[]][]) {
    for (const entry of entries) {
      if (matchesEntry(tokens, entry)) {
        if (!topics.includes(topic)) topics.push(topic);
        matched.push(entry);
      }
    }
  }
  return topics.length > 0 ? { topics, matched, numbers } : null;
}
