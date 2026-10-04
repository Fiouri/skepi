import { detectEmergency, type EmergencyMatch, type EmergencyTopic } from './emergency';
import { foldText, tokenize } from './text';

/**
 * Medical intent (architecture, "User safety"): a question about doses, drugs, symptoms, diseases or
 * treatment. The Ask screen then shows the emergency number and Layer 1 first, and the AI summary
 * only on tap, labelled "Unverified AI summary — check the source". Lexicon-based and deterministic,
 * like the emergency intercept; English and Greek.
 */
export interface MedicalIntent {
  /** Lexicon entries that matched (folded form). */
  matched: string[];
  /** Set when the question is also an emergency (its card and number come first). */
  emergency: EmergencyMatch | null;
}

/**
 * Folded entries (lowercase, no accents, σ for final sigma). A trailing `*` is a token prefix (for
 * Greek inflection and English plurals); a space means consecutive tokens; otherwise exact token.
 */
export const MEDICAL_LEXICON: readonly string[] = [
  // English: doses and drugs
  'dose', 'doses', 'dosage*', 'overdos*', 'mg', 'mcg', 'ml', 'tablet*', 'pill*', 'capsule*', 'medication*', 'medicine*',
  'drug', 'drugs', 'prescri*', 'antibiotic*', 'painkiller*', 'analgesic*', 'paracetamol', 'acetaminophen', 'ibuprofen',
  'aspirin', 'amoxicillin', 'penicillin', 'insulin', 'antihistamine*', 'epinephrine', 'adrenaline', 'morphine',
  'opioid*', 'vaccin*', 'inject*', 'side effect*', 'contraindicat*',
  // English: symptoms, conditions, care
  'symptom*', 'diagnos*', 'treat', 'treats', 'treatment*', 'treating', 'therap*', 'disease*', 'infection*', 'infected',
  'fever', 'pain', 'painful', 'wound*', 'injur*', 'bleeding', 'diarrh*', 'vomit*', 'nausea', 'dehydrat*', 'diabet*',
  'blood pressure', 'hypertension', 'asthma', 'allerg*', 'pregnan*', 'rash', 'sepsis', 'cholera', 'malaria',
  'tetanus', 'rabies', 'pneumonia', 'influenza', 'flu', 'covid*', 'cough*', 'headache*', 'migraine*', 'heart',
  'cardiac', 'stroke', 'seizure*', 'poison*', 'antidote*', 'first aid', 'cpr', 'fracture*', 'sprain*', 'burn',
  'burns', 'frostbite', 'hypotherm*', 'heatstroke', 'concussion', 'splint*', 'tourniquet*', 'suture*', 'stitches',
  // Greek: doses and drugs
  'δοση', 'δοσεισ', 'δοσολογ*', 'υπερδοσολογ*', 'φαρμακ*', 'χαπι', 'χαπια', 'δισκι*', 'καψουλ*', 'αντιβιοτικ*',
  'αντιβιωσ*', 'παυσιπον*', 'αναλγητικ*', 'παρακεταμολη', 'ιβουπροφαιν*', 'ασπιριν*', 'ινσουλιν*', 'αντιισταμινικ*',
  'αδρεναλιν*', 'μορφιν*', 'εμβολι*', 'ενεσ*', 'παρενεργει*', 'συνταγογραφ*',
  // Greek: symptoms, conditions, care
  'συμπτωμ*', 'διαγνωσ*', 'θεραπει*', 'θεραπευ*', 'ασθενει*', 'νοσημ*', 'νοσηλ*', 'νοσοκομει*', 'λοιμωξ*', 'μολυνσ*', 'πυρετ*', 'πονο*', 'πονα*',
  'τραυμ*', 'πληγ*', 'αιμορραγ*', 'διαρρο*', 'εμετ*', 'ναυτι*', 'αφυδατωσ*', 'διαβητ*', 'πιεση', 'υπερτασ*',
  'ασθμα*', 'αλλεργ*', 'εγκυ*', 'εγκυμοσυν*', 'εξανθημ*', 'σηψαιμ*', 'χολερ*', 'ελονοσ*', 'τετανο*', 'λυσσα',
  'πνευμονι*', 'γριπ*', 'βηχα*', 'βηχασ', 'πονοκεφαλ*', 'ημικρανι*', 'καρδια', 'καρδιασ', 'καρδιακ*', 'εγκεφαλικ*', 'επιληψ*',
  'δηλητηρι*', 'αντιδοτ*', 'πρωτεσ βοηθειεσ', 'καρπα', 'καταγμα*', 'διαστρεμμα*', 'εγκαυμ*', 'κρυοπαγημα*',
  'υποθερμι*', 'θερμοπληξι*', 'διασεισ*', 'ναρθηκ*', 'ραμματα',
];

const MEDICAL_EMERGENCY_TOPICS: ReadonlySet<EmergencyTopic> = new Set<EmergencyTopic>([
  'cpr', 'bleeding', 'choking', 'burn', 'poisoning', 'fracture', 'hypothermia', 'heatstroke', 'drowning',
  'heart-attack', 'stroke', 'seizure', 'anaphylaxis',
]);

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

/** Null when the question has no medical term and is not a medical emergency. */
export function detectMedicalIntent(question: string, emergency: EmergencyMatch | null = detectEmergency(question)): MedicalIntent | null {
  const tokens = tokenize(foldText(question));
  const matched = MEDICAL_LEXICON.filter((entry) => matchesEntry(tokens, entry));
  const medicalEmergency = emergency !== null && emergency.topics.some((t) => MEDICAL_EMERGENCY_TOPICS.has(t));
  if (matched.length === 0 && !medicalEmergency) return null;
  return { matched, emergency: medicalEmergency ? emergency : null };
}
