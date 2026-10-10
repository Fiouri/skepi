/**
 * tsx tools/notices/src/cli.ts generate   writes apps/<app>/src/generated/third-party-notices.json
 * tsx tools/notices/src/cli.ts check      fails when the JavaScript and Rust parts are stale (the Android
 *                                         part needs a prebuilt android/ and is checked by `generate`)
 * The Android part reads apps/mobile/android/app/build/skepi/android-dependencies.json
 * (`gradlew :app:skepiAndroidDependencies`); without it, `generate` keeps the committed Android entries.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, NATIVE_DESKTOP, NATIVE_MOBILE } from './native';
import { addAndroid, addJavaScript, addRust, NoticesBuilder, type NoticesFile } from './notices';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = { mobile: join(REPO, 'apps/mobile/src/generated/third-party-notices.json'), desktop: join(REPO, 'apps/desktop/src/generated/third-party-notices.json') };
const ANDROID = join(REPO, 'apps/mobile/android/app/build/skepi/android-dependencies.json');

function committed(path: string): NoticesFile | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as NoticesFile) : null;
}

function build(app: 'mobile' | 'desktop', android: 'fresh' | 'committed'): NoticesFile {
  const b = new NoticesBuilder();
  addJavaScript(b, join(REPO, 'apps', app));
  if (app === 'desktop') {
    addRust(b, REPO, 'skepi-desktop');
    for (const c of NATIVE_DESKTOP) b.add(c);
  } else {
    if (android === 'fresh') {
      addAndroid(b, JSON.parse(readFileSync(ANDROID, 'utf8')) as Parameters<typeof addAndroid>[1]);
    } else {
      const old = committed(OUT.mobile);
      for (const c of old?.components.filter((x) => x.ecosystem === 'maven') ?? []) {
        b.add({ ecosystem: c.ecosystem, name: c.name, version: c.version, license: c.license, url: c.url }, [], c.texts.map((id) => old?.texts[id] ?? ''));
      }
    }
    for (const c of NATIVE_MOBILE) b.add(c);
  }
  for (const c of ASSETS) b.add(c);
  return b.build(app);
}

const serialise = (n: NoticesFile): string => `${JSON.stringify(n, null, 1)}\n`;

const command = process.argv[2];
if (command === 'generate') {
  for (const app of ['mobile', 'desktop'] as const) {
    const android = app === 'mobile' && existsSync(ANDROID) ? 'fresh' : 'committed';
    const notices = build(app, android);
    mkdirSync(dirname(OUT[app]), { recursive: true });
    writeFileSync(OUT[app], serialise(notices));
    const by = (e: string): number => notices.components.filter((c) => c.ecosystem === e).length;
    console.log(
      `${app}: ${String(notices.components.length)} components (npm ${String(by('npm'))}, cargo ${String(by('cargo'))}, maven ${String(by('maven'))}${android === 'committed' && app === 'mobile' ? ' kept' : ''}, native ${String(by('native'))}), ${String(Object.keys(notices.texts).length)} texts -> ${OUT[app]}`,
    );
  }
} else if (command === 'check') {
  let stale = 0;
  for (const app of ['mobile', 'desktop'] as const) {
    const now = serialise(build(app, 'committed'));
    const old = existsSync(OUT[app]) ? readFileSync(OUT[app], 'utf8') : '';
    if (now !== old) {
      console.error(`${OUT[app]} is stale: run pnpm --filter @skepi/notices generate`);
      stale += 1;
    }
  }
  if (stale > 0) process.exit(1);
  console.log('NOTICES OK');
} else {
  console.error('usage: cli.ts generate|check');
  process.exit(2);
}
