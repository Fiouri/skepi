/**
 * Release JS bundle rebuild probe (Phase 1c finding: the React Native bundle task tracked only
 * apps/mobile, so a change in packages/ or modules/ alone shipped stale code). The probe appends a
 * unique exported string to one source file in packages/ and one in modules/, rebuilds the release
 * bundle, and requires that the bundle task ran and the new string is inside the bundle.
 */

/** One file per workspace folder that the app's bundle includes. */
export const PROBE_TARGETS: readonly { dir: 'packages' | 'modules'; file: string }[] = [
  { dir: 'packages', file: 'packages/core/src/index.ts' },
  { dir: 'modules', file: 'modules/expo-emergency-tools/src/index.ts' },
];

export const BUNDLE_TASK = ':app:createBundleReleaseJsAndAssets';

export function probeMarker(nonce: string): string {
  if (!/^[a-z0-9]{6,32}$/.test(nonce)) throw new Error('nonce must be 6-32 lowercase letters or digits');
  return `skepi-bundle-probe-${nonce}`;
}

/** The appended source line: an exported constant, so the bundler keeps the string. */
export function probeSource(nonce: string): string {
  return `\nexport const SKEPI_BUNDLE_PROBE_${nonce.toUpperCase()} = '${probeMarker(nonce)}';\n`;
}

export type TaskOutcome = 'executed' | 'up-to-date' | 'from-cache' | 'skipped' | 'no-source' | 'missing';

const OUTCOMES: Readonly<Record<string, TaskOutcome>> = {
  'UP-TO-DATE': 'up-to-date',
  'FROM-CACHE': 'from-cache',
  SKIPPED: 'skipped',
  'NO-SOURCE': 'no-source',
};

/** Outcome of one task from `gradlew --console=plain` output. */
export function taskOutcome(output: string, task: string): TaskOutcome {
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const prefix = `> Task ${task}`;
    if (!line.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length).trim();
    if (rest === '') return 'executed';
    const outcome = OUTCOMES[rest];
    if (outcome) return outcome;
  }
  return 'missing';
}

/** True when the bytes contain the ASCII marker (Hermes keeps string literals as plain bytes). */
export function bundleContains(bundle: Uint8Array, marker: string): boolean {
  return Buffer.from(bundle).includes(Buffer.from(marker, 'latin1'));
}
