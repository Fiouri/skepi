/**
 * Usage (from the repository root): tsx tools/release-guards/src/bundle-probe-cli.ts [--android-dir apps/mobile/android]
 * Restores every probed file, even on failure.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BUNDLE_TASK, bundleContains, probeMarker, probeSource, PROBE_TARGETS, taskOutcome, type TaskOutcome } from './bundle-probe';

const { values } = parseArgs({ options: { 'android-dir': { type: 'string', default: 'apps/mobile/android' } } });
const root = process.cwd();
const androidDir = resolve(root, values['android-dir']);

function gradle(): TaskOutcome {
  const win = process.platform === 'win32';
  const r = spawnSync(win ? join(androidDir, 'gradlew.bat') : './gradlew', [BUNDLE_TASK, '--console=plain'], {
    cwd: androidDir,
    encoding: 'utf8',
    shell: win,
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0) {
    console.error(output.slice(-4000));
    throw new Error(`gradle ${BUNDLE_TASK} failed (exit ${String(r.status)})`);
  }
  return taskOutcome(output, BUNDLE_TASK);
}

/** Newest release `index.android.bundle` under the app's generated assets. */
function bundlePath(): string {
  const found: { path: string; mtime: number }[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name === 'index.android.bundle' && /release/i.test(p)) found.push({ path: p, mtime: st.mtimeMs });
    }
  };
  walk(join(androidDir, 'app', 'build', 'generated'));
  const newest = found.sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) throw new Error('release bundle not found under app/build/generated');
  return newest.path;
}

const originals = new Map<string, string>();
let failed = false;
try {
  console.log(`baseline ${BUNDLE_TASK}: ${gradle()}`);
  const again = gradle();
  console.log(`unchanged sources: ${again}`);
  if (again !== 'up-to-date') {
    throw new Error(`the bundle task must be UP-TO-DATE when nothing changed (got ${again}); the probe would prove nothing`);
  }
  for (const target of PROBE_TARGETS) {
    const nonce = randomBytes(6).toString('hex');
    const file = join(root, target.file);
    const original = readFileSync(file, 'utf8');
    originals.set(file, original);
    writeFileSync(file, original + probeSource(nonce));
    const outcome = gradle();
    const contains = bundleContains(readFileSync(bundlePath()), probeMarker(nonce));
    console.log(`${target.dir}/ change (${target.file}): task ${outcome}, probe in bundle: ${String(contains)}`);
    writeFileSync(file, original);
    originals.delete(file);
    if (outcome !== 'executed' || !contains) {
      failed = true;
      console.error(`FAIL: a change in ${target.dir}/ did not rebuild the release JS bundle`);
    }
  }
  // Back to the committed sources: the bundle is rebuilt once more without any probe.
  console.log(`restored sources: ${gradle()}`);
} finally {
  for (const [file, text] of originals) writeFileSync(file, text);
}
if (failed) process.exit(1);
console.log('BUNDLE REBUILD PROBE: PASS');
