import { describe, expect, it } from 'vitest';
import { changedPassages, formatPassages } from '../src/drift';

const BEFORE = ['# Floods', 'Intro.', '## During a Flood', '- Evacuate if told to evacuate.', '- Do not walk through flood waters.', '## After a Flood', '- Stay away from power lines.'].join('\n');

describe('changedPassages', () => {
  it('finds nothing when the text is the same', () => {
    expect(changedPassages(BEFORE, BEFORE)).toEqual([]);
  });

  it('shows a reworded block as removed and added under its headings', () => {
    const after = BEFORE.replace('- Do not walk through flood waters.', '- Do not walk, swim or drive through flood waters.');
    expect(changedPassages(BEFORE, after)).toEqual([
      { headings: ['Floods', 'During a Flood'], removed: ['- Do not walk through flood waters.'], added: ['- Do not walk, swim or drive through flood waters.'] },
    ]);
  });

  it('reports separate changes separately, including additions and removals', () => {
    const after = BEFORE.replace('Intro.\n', '').concat('\n- Clean and disinfect everything that got wet.');
    expect(changedPassages(BEFORE, after)).toEqual([
      { headings: ['Floods'], removed: ['Intro.'], added: [] },
      { headings: ['Floods', 'After a Flood'], removed: [], added: ['- Clean and disinfect everything that got wet.'] },
    ]);
  });

  it('formats the passages for the drift issue', () => {
    const after = BEFORE.replace('- Stay away from power lines.', '- Stay away from downed power lines.');
    expect(formatPassages(changedPassages(BEFORE, after))).toEqual([
      '  - under "Floods" > "After a Flood":',
      '    - removed: "Stay away from power lines."',
      '    - added: "Stay away from downed power lines."',
    ]);
  });
});
