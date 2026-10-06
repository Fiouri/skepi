/**
 * Release permission allowlist (Phase 1d, P2P additions in Phase 2a). The release APK may request
 * exactly these Android permissions; anything else fails CI. Background location is never allowed,
 * and the app never installs packages itself (shared APKs are installed from a browser).
 */
export const ALLOWED_PERMISSIONS: readonly string[] = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  // Phase 2a, P2P (modules/expo-transfer): LocalOnlyHotspot, joining it, nearby Wi-Fi (Android 13+,
  // neverForLocation), and the camera for the pairing QR code.
  'android.permission.CHANGE_WIFI_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.NEARBY_WIFI_DEVICES',
  'android.permission.CAMERA',
];

export const FORBIDDEN_PERMISSIONS: readonly string[] = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.RECORD_AUDIO',
];

/**
 * androidx.core declares `<applicationId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (signature level,
 * defined by the app itself) so that runtime-registered receivers stay private. It grants nothing to
 * other apps and is the only app-defined permission allowed.
 */
export function appInternalPermissions(applicationId: string): string[] {
  return [`${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`];
}

export interface DumpedPermissions {
  packageName: string | null;
  /** `uses-permission` entries. */
  uses: string[];
  /** `permission` entries the APK itself defines. */
  defines: string[];
}

/** Parses `aapt2 dump permissions <apk>` output. */
export function parseAapt2Permissions(output: string): DumpedPermissions {
  const out: DumpedPermissions = { packageName: null, uses: [], defines: [] };
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const pkg = /^package:\s*(\S+)/.exec(line);
    if (pkg?.[1]) {
      out.packageName = pkg[1];
      continue;
    }
    const uses = /^uses-permission(?:-sdk-23)?:\s*name='([^']+)'/.exec(line);
    if (uses?.[1]) {
      out.uses.push(uses[1]);
      continue;
    }
    const defines = /^permission:\s*(\S+)/.exec(line);
    if (defines?.[1]) out.defines.push(defines[1]);
  }
  return out;
}

export interface PermissionCheck {
  ok: boolean;
  unexpected: string[];
  forbidden: string[];
  unexpectedDefinitions: string[];
}

export function checkPermissions(dump: DumpedPermissions, applicationId: string): PermissionCheck {
  const internal = new Set(appInternalPermissions(applicationId));
  const allowed = new Set([...ALLOWED_PERMISSIONS, ...internal]);
  const forbidden = dump.uses.filter((p) => FORBIDDEN_PERMISSIONS.includes(p));
  const unexpected = dump.uses.filter((p) => !allowed.has(p) && !FORBIDDEN_PERMISSIONS.includes(p));
  const unexpectedDefinitions = dump.defines.filter((p) => !internal.has(p));
  const packageOk = dump.packageName === applicationId;
  return {
    ok: packageOk && forbidden.length === 0 && unexpected.length === 0 && unexpectedDefinitions.length === 0,
    unexpected: packageOk ? unexpected : [...unexpected, `package ${dump.packageName ?? '?'} is not ${applicationId}`],
    forbidden,
    unexpectedDefinitions,
  };
}
