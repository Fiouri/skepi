import { describe, expect, it } from 'vitest';
import { bundleContains, probeMarker, probeSource, taskOutcome } from '../src/bundle-probe';
import { ALLOWED_PERMISSIONS, checkPermissions, parseAapt2Permissions } from '../src/permissions';

const DUMP = [
  'package: org.skepi.app',
  'permission: org.skepi.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  "uses-permission: name='android.permission.INTERNET'",
  "uses-permission: name='android.permission.ACCESS_NETWORK_STATE'",
  "uses-permission: name='android.permission.ACCESS_WIFI_STATE'",
  "uses-permission: name='android.permission.ACCESS_FINE_LOCATION'",
  "uses-permission: name='android.permission.ACCESS_COARSE_LOCATION'",
  "uses-permission: name='android.permission.CHANGE_WIFI_STATE'",
  "uses-permission: name='android.permission.CHANGE_NETWORK_STATE'",
  "uses-permission: name='android.permission.NEARBY_WIFI_DEVICES'",
  "uses-permission: name='android.permission.CAMERA'",
  "uses-permission: name='org.skepi.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'",
  '',
].join('\n');

describe('permission allowlist', () => {
  it('parses aapt2 output', () => {
    const d = parseAapt2Permissions(DUMP);
    expect(d.packageName).toBe('org.skepi.app');
    expect(d.uses).toHaveLength(10);
    expect(d.defines).toEqual(['org.skepi.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']);
  });

  it('passes the Phase 2a allowlist (Phase 1d + exactly the four P2P permissions)', () => {
    expect(checkPermissions(parseAapt2Permissions(DUMP), 'org.skepi.app')).toEqual({ ok: true, unexpected: [], forbidden: [], unexpectedDefinitions: [] });
    expect(ALLOWED_PERMISSIONS).toHaveLength(9);
  });

  it('fails on background location, package installs and foreign permissions', () => {
    const extra = [
      DUMP,
      "uses-permission: name='android.permission.ACCESS_BACKGROUND_LOCATION'",
      "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'",
      "uses-permission-sdk-23: name='android.permission.READ_CONTACTS'",
      "uses-permission: name='android.permission.FOREGROUND_SERVICE'",
      'permission: com.example.SHARED',
    ].join('\n');
    const r = checkPermissions(parseAapt2Permissions(extra), 'org.skepi.app');
    expect(r.ok).toBe(false);
    expect(r.forbidden).toEqual(['android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.REQUEST_INSTALL_PACKAGES']);
    expect(r.unexpected).toEqual(['android.permission.READ_CONTACTS', 'android.permission.FOREGROUND_SERVICE']);
    expect(r.unexpectedDefinitions).toEqual(['com.example.SHARED']);
  });

  it('fails when the APK is not the release application id', () => {
    const dev = DUMP.replace(/org\.skepi\.app/g, 'org.skepi.app.dev');
    expect(checkPermissions(parseAapt2Permissions(dev), 'org.skepi.app').ok).toBe(false);
  });
});

describe('bundle probe', () => {
  it('reads task outcomes from plain console output', () => {
    const t = ':app:createBundleReleaseJsAndAssets';
    expect(taskOutcome(`> Task :app:preBuild\n> Task ${t}\n> Task :app:x`, t)).toBe('executed');
    expect(taskOutcome(`> Task ${t} UP-TO-DATE\n`, t)).toBe('up-to-date');
    expect(taskOutcome(`> Task ${t} FROM-CACHE`, t)).toBe('from-cache');
    expect(taskOutcome('> Task :app:other', t)).toBe('missing');
  });

  it('builds a marker and finds it in bytes', () => {
    const src = probeSource('abc123def456');
    expect(src).toContain("export const SKEPI_BUNDLE_PROBE_ABC123DEF456 = 'skepi-bundle-probe-abc123def456';");
    const bytes = Buffer.concat([Buffer.from([0xc6, 0x1f, 0x00]), Buffer.from('xx skepi-bundle-probe-abc123def456 yy')]);
    expect(bundleContains(bytes, probeMarker('abc123def456'))).toBe(true);
    expect(bundleContains(bytes, probeMarker('ffffff000000'))).toBe(false);
    expect(() => probeMarker('NO!')).toThrow();
  });
});
