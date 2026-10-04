import { describe, expect, it } from 'vitest';
import { detectMedicalIntent } from '../src/medical';

describe('detectMedicalIntent', () => {
  it.each([
    'What is the dose of paracetamol for adults?',
    'How much ibuprofen can a child take?',
    'Symptoms of dehydration',
    'How to treat a burn',
    'Is cholera an infection?',
    'Ποια είναι η δοσολογία της παρακεταμόλης;',
    'Τι φάρμακο παίρνω για πυρετό;',
    'Συμπτώματα αφυδάτωσης',
    'Πώς θεραπεύεται η γρίπη;',
  ])('flags %s', (q) => {
    expect(detectMedicalIntent(q)).not.toBeNull();
  });

  it.each([
    'What is the capital of France?',
    'When was the Eiffel Tower built?',
    'Πού βρίσκεται η Πάτρα;',
    'Ποιο είναι το πιο νόστιμο φαγητό;',
    'Πού είναι η Καρδίτσα;',
    'What to do in an earthquake?',
  ])('does not flag %s', (q) => {
    expect(detectMedicalIntent(q)).toBeNull();
  });

  it('treats medical emergencies as medical and keeps the emergency match', () => {
    const intent = detectMedicalIntent('He is not breathing');
    expect(intent?.emergency?.topics).toContain('cpr');
  });

  it('lists the matched lexicon entries', () => {
    expect(detectMedicalIntent('paracetamol dosage in mg')?.matched).toEqual(['dosage*', 'mg', 'paracetamol']);
  });
});
