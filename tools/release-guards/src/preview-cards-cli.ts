/**
 * Usage (from the repository root): tsx tools/release-guards/src/preview-cards-cli.ts <file or folder>...
 * Fails when any emergency-card advice text is in the given bundle files (folders: every .js, .bundle,
 * .hbc file inside) or when no bundle file was found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { adviceTexts, findAdvice, probeOf } from './preview-cards';

const BUNDLE = /\.(js|bundle|hbc)$/;

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(path, e.name)) : BUNDLE.test(e.name) ? [join(path, e.name)] : []));
}

const targets = process.argv.slice(2).map((p) => resolve(p));
if (targets.length === 0) {
  console.error('usage: preview-cards-cli.ts <bundle file or folder>...');
  process.exit(2);
}
const texts = adviceTexts();
const probed = texts.filter((t) => probeOf(t) !== null).length;
const bundles = targets.flatMap(files);
if (bundles.length === 0) {
  console.error('PREVIEW CARDS FAIL: no bundle file found');
  process.exit(1);
}
let found = 0;
for (const file of bundles) {
  const hits = findAdvice(new Uint8Array(readFileSync(file)), texts);
  found += hits.length;
  for (const h of hits) console.error(`${file}: contains card advice "${h.slice(0, 80)}…"`);
}
if (found > 0) {
  console.error(`PREVIEW CARDS FAIL: ${String(found)} advice texts in ${String(bundles.length)} bundle files`);
  process.exit(1);
}
console.log(`PREVIEW CARDS PASS: none of ${String(probed)} advice texts (of ${String(texts.length)}) in ${String(bundles.length)} bundle files`);
