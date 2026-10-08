// Copies the bundled offline map assets (style, glyphs, sprites; built by scripts/build-map-assets.mjs
// for the mobile app) into apps/desktop/public/map, checking each file against its SHA-256 in
// apps/mobile/assets/map/manifest.json. The map never loads anything from the network.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'mobile', 'assets', 'map');
const OUT = join(HERE, '..', 'public', 'map');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
let n = 0;
for (const [rel, sha] of Object.entries(manifest.files)) {
  const bytes = readFileSync(join(SRC, rel));
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== sha) throw new Error(`${rel}: SHA-256 ${got} does not match the manifest (${sha})`);
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  copyFileSync(join(SRC, rel), join(OUT, rel));
  n += 1;
}
console.log(`map assets: ${n} files verified and copied to public/map`);
