import { CARDS, WEB_SOURCES, type EmergencyCard, type SourceId } from '@skepi/emergency-cards';
import { describe, expect, it } from 'vitest';
import { checkWebSteps } from '../src/check';
import { decodeEntities, extractHtmlText } from '../src/html';
import { formatSnapshot, parseSnapshot, readSnapshot, textSha256 } from '../src/snapshot';

const HTML = `<!doctype html><html><head><title>t</title><script>var x = "<p>no</p>";</script></head>
<body><nav><a href="/">Home</a></nav>
<main class="usa-section"><h1>Floods</h1>
<div><button>Menu</button><p>Intro &amp; <strong>bold</strong> text&nbsp;here.</p></div>
<h2>During a Flood</h2>
<ul><li>Stay off bridges over fast-moving water. Fast-moving water can wash bridges away without warning.</li>
<li>Do not walk, swim or drive through flood waters. Turn Around. Don&rsquo;t Drown!</li></ul>
<!-- <p>Commented out.</p> -->
<h3>Trapped</h3><p>Get to the highest level if
  trapped in a building.</p>
<h2>After a Flood</h2><p>Return home only when authorities say it is safe.</p>
<main><p>Nested main.</p></main>
</main><footer><p>Footer text.</p></footer></body></html>`;

describe('HTML text extraction', () => {
  const text = extractHtmlText(HTML);

  it('keeps only <main>, one block per line, headings and list items marked', () => {
    expect(text).toBe(
      [
        '# Floods',
        'Intro & bold text\u00a0here.'.replace('\u00a0', ' '),
        '## During a Flood',
        '- Stay off bridges over fast-moving water. Fast-moving water can wash bridges away without warning.',
        '- Do not walk, swim or drive through flood waters. Turn Around. Don\u2019t Drown!',
        '### Trapped',
        'Get to the highest level if trapped in a building.',
        '## After a Flood',
        'Return home only when authorities say it is safe.',
        'Nested main.',
        '',
      ].join('\n'),
    );
    expect(text).not.toContain('Home');
    expect(text).not.toContain('Footer');
    expect(text).not.toContain('Menu');
    expect(text).not.toContain('Commented');
  });

  it('is deterministic', () => {
    expect(extractHtmlText(HTML)).toBe(text);
  });

  it('decodes numeric and named references, leaves unknown names', () => {
    expect(decodeEntities('&#8217;&#x2013;&amp;&frac18;')).toBe('\u2019\u2013&&frac18;');
  });
});

describe('snapshots', () => {
  it('round-trip the header and the text', () => {
    const s = { url: 'https://www.ready.gov/floods', retrieved: '2026-10-21', htmlSha256: 'a'.repeat(64), text: '# Floods\nText.\n' };
    expect(parseSnapshot(formatSnapshot(s))).toEqual(s);
  });

  it('every committed snapshot matches the source pinned in sources.ts', () => {
    for (const w of WEB_SOURCES) {
      const snap = readSnapshot(w.id);
      expect(snap.url).toBe(w.url);
      expect(snap.retrieved).toBe(w.accessed);
      expect(snap.htmlSha256).toBe(w.htmlSha256);
      expect(textSha256(snap.text)).toBe(w.textSha256);
    }
  });
});

describe('checkWebSteps', () => {
  const snaps = new Map<SourceId, string>([['ready-floods', extractHtmlText(HTML)]]);
  const card = (text: string, section: string): EmergencyCard => ({
    id: 'flood',
    topics: ['flood'],
    steps: [{ text, cite: { source: 'ready-floods', section, page: null } }],
    labels: { en: { title: 't', keywords: ['k'] }, el: { title: 't', keywords: ['k'] } },
  });
  const run = (text: string, section = 'During a Flood') => checkWebSteps(snaps, [card(text, section)])[0];

  it('accepts whole sentences of one block under the cited heading (typographic or plain quotes)', () => {
    expect(run('Stay off bridges over fast-moving water.')?.ok).toBe(true);
    expect(run('Do not walk, swim or drive through flood waters. Turn Around. Don\u2019t Drown!')?.ok).toBe(true);
    expect(run("Turn Around. Don't Drown!")?.ok).toBe(true);
    expect(run('Get to the highest level if trapped in a building.', 'Trapped')?.ok).toBe(true);
    expect(run('Get to the highest level if trapped in a building.', 'During a Flood')?.ok).toBe(true);
  });

  it('rejects an edited quote, text spanning two blocks and the wrong heading', () => {
    expect(run('Stay off bridges over fast moving water.')?.problem).toBe('not an exact excerpt of one block of the ready-floods snapshot');
    expect(run('Stay off bridges over fast-moving water. Turn Around. Don\u2019t Drown!')?.ok).toBe(false);
    expect(run('Return home only when authorities say it is safe.')?.problem).toBe('not under the heading "During a Flood" in the ready-floods snapshot');
    expect(run('Return home only when authorities say it is safe.', 'After a Flood')?.ok).toBe(true);
  });

  it('rejects a step whose source has no snapshot', () => {
    expect(checkWebSteps(new Map(), [card('Stay off bridges over fast-moving water.', 'During a Flood')])[0]?.problem).toBe('no snapshot of ready-floods');
  });

  it('every web-sourced card step is verbatim in its committed snapshot', () => {
    const committed = new Map<SourceId, string>(WEB_SOURCES.map((w) => [w.id, readSnapshot(w.id).text]));
    const results = checkWebSteps(committed, CARDS);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results).toHaveLength(50);
  });
});
