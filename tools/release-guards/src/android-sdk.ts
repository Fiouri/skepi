import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The newest build-tools' aapt2 from ANDROID_HOME / ANDROID_SDK_ROOT. */
export function findAapt2(): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT must point to the Android SDK');
  const dir = join(sdk, 'build-tools');
  const versions = readdirSync(dir)
    .filter((v) => /^\d+\.\d+\.\d+/.test(v))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  const exe = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
  for (const v of versions) {
    const candidate = join(dir, v, exe);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`no aapt2 in ${dir}`);
}
