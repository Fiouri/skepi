/**
 * The text of a public-domain HTML source page, as committed in snapshots/ and compared by the check:
 * - only the page's <main> element (the whole document when it has none): no navigation, footer or
 *   banners;
 * - <script>, <style>, <noscript>, <svg>, <template>, <iframe>, <button>, <select> and comments are
 *   dropped;
 * - every block element (paragraph, list item, heading, cell...) is one line; a heading line starts with
 *   "#" per level and a space, a list item with "- "; inline tags are dropped without adding spaces;
 * - character references are decoded; whitespace (source line breaks too) becomes single spaces.
 * The extraction is deterministic: the same HTML always gives the same text (the drift check compares
 * the committed text with the text of a fresh download).
 */
const DROPPED = ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'button', 'select', 'head'];
const BLOCKS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'header', 'hr', 'legend', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', shy: '\u00ad', ndash: '\u2013', mdash: '\u2014',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', sbquo: '\u201a', bdquo: '\u201e', hellip: '\u2026',
  deg: '\u00b0', frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', times: '\u00d7', reg: '\u00ae', copy: '\u00a9',
  trade: '\u2122', bull: '\u2022', middot: '\u00b7', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c',
  zwj: '\u200d', laquo: '\u00ab', raquo: '\u00bb', eacute: '\u00e9', ntilde: '\u00f1', prime: '\u2032', Prime: '\u2033',
  ...latin1Letters(),
};

/**
 * The HTML 4 names of the Latin-1 letters (U+00C0–U+00FF except × and ÷): official pages in other
 * languages write them as references (112.gov.tr: "&Uuml;lkemizde", "&ccedil;ağrı").
 */
function latin1Letters(): Record<string, string> {
  const names =
    'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml - Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
    'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml - oslash ugrave uacute ucirc uuml yacute thorn yuml';
  const out: Record<string, string> = {};
  names.split(' ').forEach((name, i) => {
    if (name !== '-') out[name] = String.fromCodePoint(0xc0 + i);
  });
  return out;
}

/** Decodes numeric and the common named character references; unknown names stay as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/gu, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[ref] ?? whole;
  });
}

/** The inner HTML of the first <main> element (to its matching end tag), else the whole document. */
function mainOf(html: string): string {
  const open = html.match(/<main\b[^>]*>/iu);
  if (!open || open.index === undefined) return html;
  const start = open.index + open[0].length;
  let depth = 1;
  for (const m of html.slice(start).matchAll(/<(\/?)main\b[^>]*>/giu)) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, start + m.index);
  }
  return html.slice(start);
}

export function extractHtmlText(html: string): string {
  let body = mainOf(html).replace(/<!--[\s\S]*?-->/gu, '');
  for (const name of DROPPED) body = body.replace(new RegExp(`<${name}\\b[\\s\\S]*?</${name}\\s*>`, 'giu'), ' ');
  // Source line breaks are spaces (as a browser renders them); only block elements break lines.
  const out = body.replace(/\s+/gu, ' ').replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gu, (_tag, close: string, rawName: string) => {
    const name = rawName.toLowerCase();
    const heading = name.match(/^h([1-6])$/u);
    if (heading) return close ? '\n' : `\n${'#'.repeat(Number(heading[1]))} `;
    if (name === 'li' && !close) return '\n- ';
    return BLOCKS.has(name) ? '\n' : '';
  });
  const lines: string[] = [];
  for (const raw of decodeEntities(out.replace(/<[^>]*>/gu, '')).split('\n')) {
    const line = raw.replace(/[\s\u200b\ufeff]+/gu, ' ').trim();
    if (line.length === 0 || /^(#+|-)$/u.test(line)) continue;
    lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}
