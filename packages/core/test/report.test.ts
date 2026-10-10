import { describe, expect, it } from 'vitest';
import { buildLayer1 } from '../src/extractive';
import { problemReportText } from '../src/report';

const labels = {
  title: 'SKEPI problem report',
  question: 'Question',
  layer1: 'Source excerpts shown',
  ai: 'AI summary shown',
  noAi: 'No AI summary shown',
  sources: 'Cited sources',
  version: 'App version',
  describe: 'What is wrong (write it here):',
};
const source = { id: 'S1', archiveId: 'arch-7', path: 'Lighthouse_keeping', title: 'Lighthouse keeping', heading: 'Duties', text: 'Keepers trimmed the wicks nightly. They logged passing ships.' };

describe('problem report text', () => {
  it('holds the question, what was shown, the sources and the version, nothing else', () => {
    const text = problemReportText(
      {
        appVersion: 'SKEPI 0.1.0-preview (Android)',
        question: 'What did lighthouse keepers do at night?',
        layer1: buildLayer1('What did lighthouse keepers do at night?', [source]),
        aiSentences: [{ text: 'Keepers trimmed the wicks every night.', source: 'S1' }],
        sources: [source],
      },
      labels,
    );
    expect(text).toContain('App version: SKEPI 0.1.0-preview (Android)');
    expect(text).toContain('What did lighthouse keepers do at night?');
    expect(text).toContain('[S1] Lighthouse keeping — Duties: Keepers trimmed the wicks nightly.');
    expect(text).toContain('- Keepers trimmed the wicks every night. [S1]');
    expect(text).toContain('[S1] Lighthouse keeping — Duties (Lighthouse_keeping)');
    // No archive ids, dates or other identifiers.
    expect(text).not.toContain('arch-7');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('says when no AI summary was shown', () => {
    const text = problemReportText({ appVersion: 'SKEPI 0.1.0-preview (Windows)', question: 'q', layer1: null, aiSentences: [], sources: [] }, labels);
    expect(text).toContain('No AI summary shown.');
  });
});
