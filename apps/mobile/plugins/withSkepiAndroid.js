// Android build customisations for the Phase 0 spike (CNG: android/ is generated, never edited by hand).
// - arm64-v8a only (ABI split), llama.rn compiled from source (no prebuilt download).
// - Bundled offline map assets copied to android assets (served as asset://map/...).
// - Release manifest has no INTERNET permission: the spike app is offline by construction.
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins');

const ABI = 'arm64-v8a';

function setGradleProperty(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

const withProperties = (config) =>
  withGradleProperties(config, (cfg) => {
    setGradleProperty(cfg.modResults, 'reactNativeArchitectures', ABI);
    setGradleProperty(cfg.modResults, 'rnllamaBuildFromSource', 'true');
    return cfg;
  });

const SPLITS_MARKER = '// skepi:abi-split';
const withAbiSplit = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(SPLITS_MARKER)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /\nandroid\s*\{\n/,
      `\nandroid {\n    ${SPLITS_MARKER}\n    splits {\n        abi {\n            enable true\n            reset()\n            include "${ABI}"\n            universalApk false\n        }\n    }\n`,
    );
    return cfg;
  });

const withMapAssets = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const source = path.join(cfg.modRequest.projectRoot, 'assets', 'map');
      const target = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'map');
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      return cfg;
    },
  ]);

const withOfflineManifest = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const perms = (manifest['uses-permission'] ?? []).filter(
      (p) => p.$['android:name'] !== 'android.permission.INTERNET',
    );
    perms.push({ $: { 'android:name': 'android.permission.INTERNET', 'tools:node': 'remove' } });
    manifest['uses-permission'] = perms;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:allowBackup'] = 'false';
    return cfg;
  });
  // Debug builds still need INTERNET for Metro; build-type manifests override the main one.
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const debugDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug');
      const file = path.join(debugDir, 'AndroidManifest.xml');
      if (!fs.existsSync(file)) return cfg;
      let xml = fs.readFileSync(file, 'utf8');
      if (!xml.includes('android.permission.INTERNET')) {
        if (!xml.includes('xmlns:tools')) {
          xml = xml.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ');
        }
        xml = xml.replace(
          /(<manifest[^>]*>)/,
          '$1\n    <uses-permission android:name="android.permission.INTERNET" tools:node="replace"/>',
        );
        fs.writeFileSync(file, xml);
      }
      return cfg;
    },
  ]);
};

// Windows: RN codegen object paths exceed 260 chars. The SDK's default CMake 3.22 bundles ninja 1.10
// (no long-path support); CMake 3.31.6 bundles ninja 1.12 which honours LongPathsEnabled.
const WINDOWS_CMAKE_VERSION = '3.31.6';
const withWindowsCmake = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      if (process.platform !== 'win32') return cfg;
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      const cmakeDir = sdk && path.join(sdk, 'cmake', WINDOWS_CMAKE_VERSION);
      if (!cmakeDir || !fs.existsSync(cmakeDir)) {
        throw new Error(`Install CMake ${WINDOWS_CMAKE_VERSION}: sdkmanager "cmake;${WINDOWS_CMAKE_VERSION}"`);
      }
      const file = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
      const existing = fs.existsSync(file)
        ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('cmake.dir='))
        : [];
      existing.push(`cmake.dir=${cmakeDir.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}`);
      fs.writeFileSync(file, `${existing.join('\n')}\n`);
      return cfg;
    },
  ]);

module.exports = (config) =>
  withWindowsCmake(withOfflineManifest(withMapAssets(withAbiSplit(withProperties(config)))));
