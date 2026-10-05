// Android build customisations for the Phase 0 spike (CNG: android/ is generated, never edited by hand).
// - arm64-v8a only (ABI split), llama.rn compiled from source (no prebuilt download).
// - Bundled offline map assets copied to android assets (served as asset://map/...).
// - Release manifest has no INTERNET permission: the app is offline by construction until Phase 1c.
// - R8 minification for release with SKEPI keep rules (plugins/proguard-rules.skepi.pro).
// - Release signing with the dedicated keystore (plugins/withReleaseSigning.js).
// - Debug installs side-by-side with release: applicationId suffix ".dev", label "SKEPI Dev".
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');
const withReleaseSigning = require('./withReleaseSigning');

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
    // Deflate native libs inside the APK (download size); they are extracted at install time.
    setGradleProperty(cfg.modResults, 'expo.useLegacyPackaging', 'true');
    // R8 for release (read by the template's build.gradle). Resource shrinking stays off.
    setGradleProperty(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    // D8 ran out of the template's 2 GB heap merging ~25 androidTest APKs in parallel.
    setGradleProperty(cfg.modResults, 'org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m');
    return cfg;
  });

// llama.rn builds 7 arm64 variants and picks one at runtime with graceful fallback
// (tryLoadLibrary). Keep the baseline + the two common fast paths; Hexagon/OpenCL stays out
// (architecture: NPU only behind a feature flag) together with its prebuilt HTP assets.
// SKEPI_GPU_EXPERIMENT=1 at prebuild time keeps the OpenCL/Hexagon variant for the Phase 1b backend
// measurements (Bench → backend). Such a build is for measurements only and is never released.
const GPU_EXPERIMENT = process.env.SKEPI_GPU_EXPERIMENT === '1';
const LLAMA_EXCLUDED_VARIANTS = GPU_EXPERIMENT ? ['v8_2', 'v8_2_i8mm'] : ['v8_2', 'v8_2_i8mm', 'v8_2_dotprod_i8mm_hexagon_opencl'];
const PACKAGING_MARKER = '// skepi:llama-variants';
const withLlamaVariants = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(PACKAGING_MARKER)) return cfg;
    const excludes = LLAMA_EXCLUDED_VARIANTS.flatMap((v) => [
      `"**/librnllama_${v}.so"`,
      `"**/librnllama_jni_${v}.so"`,
    ]).join(', ');
    cfg.modResults.contents += `
${PACKAGING_MARKER}
android {
    packaging {
        jniLibs {
            excludes += [${excludes}]
        }
    }
}
// Prebuilt Qualcomm HTP binaries from the npm package are never shipped.
tasks.configureEach { task ->
    if (task.name == "syncRNLlamaHtpAssets") task.enabled = false
}
`;
    return cfg;
  });

const PROGUARD_MARKER = '# skepi:keep-rules';
const withKeepRules = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const rules = fs.readFileSync(path.join(__dirname, 'proguard-rules.skepi.pro'), 'utf8');
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!existing.includes(PROGUARD_MARKER)) {
        fs.writeFileSync(file, `${existing.trimEnd()}

${PROGUARD_MARKER}
${rules}`);
      }
      return cfg;
    },
  ]);

// Debug = org.skepi.app.dev / "SKEPI Dev", so a dev build never replaces (or needs the signature of)
// the release install. Release keeps the plain applicationId.
const DEV_SUFFIX = '.dev';
const DEV_LABEL = 'SKEPI Dev';
const DEV_MARKER = '// skepi:dev-variant';
const withDevVariant = (config) => {
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(DEV_MARKER)) return cfg;
    cfg.modResults.contents += `
${DEV_MARKER}
android {
    buildTypes {
        debug {
            applicationIdSuffix "${DEV_SUFFIX}"
        }
    }
}
`;
    return cfg;
  });
  // The debug source set overrides main's app_name (a build-type resValue would lose to it).
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug', 'res', 'values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'strings.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">${DEV_LABEL}</string>
</resources>
`,
      );
      return cfg;
    },
  ]);
};

// libkiwix's AAR ships its own libc++_shared.so (same NDK ABI as react-android's). The app resolves
// the clash itself, but every library's androidTest APK (root `connectedAndroidTest`) needs it too.
const ANDROID_TEST_MARKER = '// skepi:android-test-packaging';
const withAndroidTestPackaging = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(ANDROID_TEST_MARKER)) return cfg;
    cfg.modResults.contents += `
${ANDROID_TEST_MARKER}
subprojects { p ->
    p.plugins.withId('com.android.library') {
        p.android.packaging.jniLibs.pickFirsts += ['**/libc++_shared.so']
    }
}
`;
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
    if (GPU_EXPERIMENT) {
      // llama.rn loads the vendor OpenCL / FastRPC libraries at runtime (README, Android GPU/NPU).
      app['uses-native-library'] = ['libOpenCL.so', 'libcdsprpc.so'].map((name) => ({
        $: { 'android:name': name, 'android:required': 'false' },
      }));
    }
    // libkiwix's AAR declares allowBackup=true; GB-sized content must never go to cloud backup.
    app.$['android:allowBackup'] = 'false';
    const replace = new Set((app.$['tools:replace'] ?? '').split(',').filter(Boolean));
    replace.add('android:allowBackup');
    app.$['tools:replace'] = [...replace].join(',');
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
  withAndroidTestPackaging(withDevVariant(
    withReleaseSigning(
      withKeepRules(
        withWindowsCmake(withOfflineManifest(withMapAssets(withLlamaVariants(withAbiSplit(withProperties(config)))))),
      ),
    ),
  ));
