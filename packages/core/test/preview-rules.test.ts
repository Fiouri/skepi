import type { ArticleText } from '@skepi/contracts';
import { describe, expect, it } from 'vitest';
import { chunkArticle } from '../src/chunk';
import { buildLayer1, type ExtractiveSource } from '../src/extractive';
import { sanitizeWithReport } from '../src/sanitize';
import { joinUnits, splitSentences, splitUnits } from '../src/text';
import { checkSentence, containsLink, sourcePairs } from '../src/validate';

// Developer Preview decision (docs/preview-report.md): generic rules, fresh examples only.

describe('table cells written as text', () => {
  it('splits at every pipe, flags units that touch one, and leaves text without pipes unchanged', () => {
    const prose = 'Kettles boil water. They switch off by themselves.';
    expect(splitUnits(prose)).toEqual(splitSentences(prose).map((text) => ({ text, cell: false, pipeBefore: false, pipeAfter: false })));
    expect(splitSentences(prose)).toEqual(['Kettles boil water.', 'They switch off by themselves.']);

    const text = 'Opening hours are listed below. | Day | Hours | | Monday | 9 to 5 | Closed on holidays.';
    const units = splitUnits(text);
    expect(units.map((u) => [u.text, u.cell])).toEqual([
      ['Opening hours are listed below.', false],
      ['Day', true],
      ['Hours', true],
      ['Monday', true],
      ['9 to 5', true],
      ['Closed on holidays.', false],
    ]);
    // Joining keeps the delimiters, so splitting again gives the same cells.
    expect(splitUnits(joinUnits(units)).map((u) => u.text)).toEqual(units.map((u) => u.text));
  });

  it('only text between two pipes is a cell', () => {
    const units = splitUnits('First fact. Second fact. | A | B | Third fact. Fourth fact.');
    expect(units.filter((u) => u.cell).map((u) => u.text)).toEqual(['A', 'B']);
    expect(splitUnits('Before. | lone pipe after').map((u) => u.cell)).toEqual([false, false]);
  });

  it('keeps cells apart through sanitizing and chunking', () => {
    const sanitized = sanitizeWithReport('Ferry times: | Port | Departs | | Rion | 07:15 | Tickets on board.').text;
    expect(sanitized).toContain('| Rion |');
    const article: ArticleText = { archiveId: 'a', path: 'Ferry', title: 'Ferry', sections: [{ heading: '', level: 0, text: sanitized }] };
    const chunk = chunkArticle(article)[0];
    expect(splitSentences(chunk?.text ?? '')).toEqual(['Ferry times:', 'Port', 'Departs', 'Rion', '07:15', 'Tickets on board.']);
  });

  it('chunks text without pipes exactly as before (sentences joined by spaces)', () => {
    const text = 'Alpha beta gamma. Delta epsilon. Zeta eta theta.';
    const article: ArticleText = { archiveId: 'a', path: 'P', title: 'P', sections: [{ heading: '', level: 0, text }] };
    expect(chunkArticle(article).map((c) => c.text)).toEqual([text]);
  });

  it('Layer 1 never highlights a table cell on its own', () => {
    const source: ExtractiveSource = {
      id: 'S1',
      archiveId: 'a',
      path: 'Rion_ferry',
      title: 'Rion ferry',
      heading: '',
      text: 'The Rion ferry crosses the gulf in 20 minutes. | Ferry | Crossing time | | Rion ferry | crossing time 20 minutes |',
    };
    const answer = buildLayer1('How long is the Rion ferry crossing time?', [source]);
    const highlighted = answer.passages.flatMap((p) => p.sentences.filter((s) => s.highlighted).map((s) => s.text));
    expect(highlighted).toEqual(['The Rion ferry crosses the gulf in 20 minutes.']);
    const cellRow = answer.passages[0]?.sentences.find((s) => s.text === 'crossing time 20 minutes');
    expect(cellRow).toMatchObject({ cell: true, highlighted: false });
  });

  it('a cell is never merged with its neighbours in the validator either', () => {
    const pairs = sourcePairs({ title: 'Grid', text: '| north gate | blue route | south gate |' });
    // No bigram spans two cells: "gate blue" would only exist if cells were merged.
    expect([...pairs].some((p) => p.includes('gate') && p.includes('blue'))).toBe(false);
  });
});

describe('comment-like spans written as text', () => {
  it('removes <!-- … --> spans whatever they say, also escaped and unterminated', () => {
    const r = sanitizeWithReport('Lanterns run on oil. <!-- any words at all --> Wicks are trimmed weekly.');
    expect(r.text).toBe('Lanterns run on oil. Wicks are trimmed weekly.');
    expect(r.removed.map((x) => x.reason)).toEqual(['comment-span']);
    expect(sanitizeWithReport('Bells ring at noon. &lt;!-- hidden note --&gt; Ropes are hemp.').text).toBe('Bells ring at noon. Ropes are hemp.');
    expect(sanitizeWithReport('Tents need pegs. <!-- this runs to the end\nNext paragraph stays.').text).toBe('Tents need pegs.\nNext paragraph stays.');
  });
});

describe('AI sentences with a URL or an e-mail address', () => {
  const source = { id: 'S1', title: 'Harbour office', heading: '', text: 'The harbour office opens at 8. Write to office@harbour.test or see https://harbour.test/info.' };
  it('are never kept, even when copied verbatim from the source', () => {
    for (const s of [
      'Write to office@harbour.test.',
      'See https://harbour.test/info for the timetable.',
      'Details are at www.harbour-info.org.',
      'The timetable is on harbour.test/info.',
      'Ask at ferry-desk.example.',
    ]) {
      expect(containsLink(s)).toBe(true);
      expect(checkSentence(s, source, 'When does the harbour office open?')).toMatchObject({ kept: false, reason: 'link' });
    }
  });
  it('do not catch abbreviations, decimals, ratios or names with a dot', () => {
    for (const s of ['The U.S. Navy, e.g., uses 2.5 m boats.', 'Dr. Lee met Mr. Ruiz in St. Ives.', 'The mix is 3:1 by weight.', 'Node.js and Vue.js are tools.', 'It ended in 1990.Then work began.']) {
      expect(containsLink(s)).toBe(false);
    }
  });
});
