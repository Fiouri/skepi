// Generates the bundled offline map assets for apps/mobile:
//   assets/map/style.json   Protomaps basemap style (light flavour, Greek labels), PMTiles source placeholder
//   assets/map/fonts/...    Glyph PBF ranges covering Latin + Greek for the fonts the style uses
//   assets/map/sprites/...  Sprite sheets
// Inputs are pinned (package version + git commit) and every downloaded file is recorded with its SHA-256
// in assets/map/manifest.json. Run: node scripts/build-map-assets.mjs
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layers, namedFlavor } from '@protomaps/basemaps';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps', 'mobile', 'assets', 'map');

const ASSETS_REPO = 'protomaps/basemaps-assets';
const ASSETS_COMMIT = '028c18f713baecad011301ff7a69acc39bcc2ae7';
const FLAVOR = 'light';
const LANG = 'el';
// Basic Latin, Latin-1, Latin Ext-A/B, Greek & Coptic, Latin Ext Additional, Greek Extended, punctuation, letterlike.
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '768-1023', '7680-7935', '7936-8191', '8192-8447', '8448-8703'];
const SPRITE_FILES = [`${FLAVOR}.json`, `${FLAVOR}.png`, `${FLAVOR}@2x.json`, `${FLAVOR}@2x.png`];

/** Placeholder replaced at runtime with `pmtiles://file://<absolute path>`. */
const PMTILES_PLACEHOLDER = 'pmtiles://__PMTILES_FILE__';

const manifest = { assetsRepo: ASSETS_REPO, assetsCommit: ASSETS_COMMIT, basemapsVersion: '', files: {} };

async function download(remotePath, localPath) {
  const url = `https://raw.githubusercontent.com/${ASSETS_REPO}/${ASSETS_COMMIT}/${remotePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  // eslint-disable-next-line no-restricted-globals -- build-time tooling, never shipped in the app
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const target = join(OUT, localPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  manifest.files[localPath] = createHash('sha256').update(bytes).digest('hex');
}

function collectFonts(styleLayers) {
  const fonts = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === 'string') && value.some((v) => v.startsWith('Noto '))) {
        value.forEach((v) => fonts.add(v));
      } else {
        value.forEach(walk);
      }
    }
  };
  for (const layer of styleLayers) walk(layer.layout?.['text-font']);
  return [...fonts].sort();
}

async function main() {
  const pkg = await import('@protomaps/basemaps/package.json', { with: { type: 'json' } });
  manifest.basemapsVersion = pkg.default.version;

  const styleLayers = layers('protomaps', namedFlavor(FLAVOR), { lang: LANG });
  const fonts = collectFonts(styleLayers);

  for (const font of fonts) {
    for (const range of GLYPH_RANGES) {
      await download(`fonts/${font}/${range}.pbf`, `fonts/${font}/${range}.pbf`);
    }
  }
  for (const file of SPRITE_FILES) {
    await download(`sprites/v4/${file}`, `sprites/${file}`);
  }

  const style = {
    version: 8,
    name: `SKEPI offline (${FLAVOR}, ${LANG})`,
    glyphs: 'asset://map/fonts/{fontstack}/{range}.pbf',
    sprite: `asset://map/sprites/${FLAVOR}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: PMTILES_PLACEHOLDER,
        attribution: '© OpenStreetMap contributors · Protomaps',
      },
    },
    layers: styleLayers,
  };
  await writeFile(join(OUT, 'style.json'), `${JSON.stringify(style)}\n`);
  await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify({ ...manifest, fonts, glyphRanges: GLYPH_RANGES }, null, 2)}\n`);
  console.log(`map assets: ${Object.keys(manifest.files).length} files, fonts: ${fonts.join(', ')}`);
}

await main();
