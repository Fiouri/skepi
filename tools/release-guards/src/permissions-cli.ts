/**
 * Usage: tsx src/permissions-cli.ts <release.apk> [--app-id org.skepi.app]
 * Fails (exit 1) unless the APK requests only the allowlisted permissions.
 */
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { findAapt2 } from './android-sdk';
import { ALLOWED_PERMISSIONS, checkPermissions, parseAapt2Permissions } from './permissions';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'app-id': { type: 'string', default: 'org.skepi.app' } } });
const apk = positionals[0];
if (!apk) {
  console.error('usage: permissions-cli <release.apk> [--app-id org.skepi.app]');
  process.exit(2);
}
const appId = values['app-id'];
const output = execFileSync(findAapt2(), ['dump', 'permissions', apk], { encoding: 'utf8' });
const dump = parseAapt2Permissions(output);
const result = checkPermissions(dump, appId);
console.log(`APK ${apk} (${dump.packageName ?? '?'}) requests:\n${dump.uses.map((p) => `  ${p}`).join('\n')}`);
if (!result.ok) {
  if (result.forbidden.length > 0) console.error(`FORBIDDEN: ${result.forbidden.join(', ')}`);
  if (result.unexpected.length > 0) console.error(`NOT ALLOWLISTED: ${result.unexpected.join(', ')}`);
  if (result.unexpectedDefinitions.length > 0) console.error(`UNEXPECTED PERMISSION DEFINITIONS: ${result.unexpectedDefinitions.join(', ')}`);
  console.error(`Allowed: ${ALLOWED_PERMISSIONS.join(', ')}`);
  process.exit(1);
}
console.log('PERMISSION ALLOWLIST: PASS');
