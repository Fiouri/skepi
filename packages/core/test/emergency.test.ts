import { describe, expect, it } from 'vitest';
import { detectEmergency } from '../src/emergency';

describe('detectEmergency', () => {
  it.each([
    ['Πώς σταματάω μια αιμορραγία;', 'bleeding'],
    ['ΚΑΡΠΑ σε ενήλικα', 'cpr'],
    ['Το παιδί πνίγεται με φαγητό', 'choking'],
    ['έγκαυμα από καυτό νερό', 'burn'],
    ['δηλητηρίαση από μανιτάρια', 'poisoning'],
    ['Τι κάνω σε σεισμό;', 'earthquake'],
    ['πλημμύρα στο σπίτι', 'flood'],
    ['He is not breathing', 'cpr'],
    ['How to stop bleeding from a cut', 'bleeding'],
    ['signs of a heart attack', 'heart-attack'],
    ['πόνος στο στήθος', 'heart-attack'],
    ['What to do in a wildfire', 'fire'],
  ])('flags %s as %s', (question, topic) => {
    const match = detectEmergency(question);
    expect(match?.topics).toContain(topic);
    expect(match?.numbers.general).toBe('112');
  });

  it.each([
    'Ποια είναι η πρωτεύουσα της Γαλλίας;',
    'Ποιος έγραψε την Οδύσσεια;',
    'How do I configure a firewall?',
    'Φωτισμός στο σπίτι',
    'What is the population of Patras?',
    '',
  ])('does not flag %s', (question) => {
    expect(detectEmergency(question)).toBeNull();
  });
});
