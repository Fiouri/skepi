import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '@skepi/i18n';

const repo = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** Markdown and store texts wrap lines; the statement must be the same words in the same order. */
const flat = (text: string): string => text.replace(/\s+/g, ' ');

describe('intended-purpose statement (identical everywhere)', () => {
  const purpose = en.about.purpose;

  it('says what the owner decided (2026-10-21)', () => {
    expect(purpose).toContain('general reference and education');
    expect(purpose).toContain('not a medical device and does not diagnose, treat, cure, or prevent any medical condition');
    expect(purpose).toContain('Consult a healthcare professional');
    expect(purpose).toContain('In an emergency, call 112');
  });

  it('is the first paragraph of the store description, within the fastlane limit', () => {
    const description = repo('fastlane/metadata/android/en-US/full_description.txt');
    expect(description.split('\n\n')[0]?.trim()).toBe(purpose);
    expect(description.length).toBeLessThanOrEqual(4000);
  });

  it.each(['README.md', 'docs/privacy-policy.md'])('appears verbatim in %s', (file) => {
    expect(flat(repo(file))).toContain(purpose);
  });
});
