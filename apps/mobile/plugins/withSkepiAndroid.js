// Android build customisations for the Phase 0 spike (CNG: android/ is generated, never edited by hand).
// - arm64-v8a only (ABI split), llama.rn compiled from source (no prebuilt download).
// - Bundled offline map assets copied to android assets (served as asset://map/...).
// - Network access only through ContentStore (plugins/withContentStore.js, modules/expo-content-store).
// - R8 minification for release with SKEPI keep rules (plugins/proguard-rules.skepi.pro).
// - Release signing with the dedicated keystore (plugins/withReleaseSigning.js).
// - Reproducible native libraries (plugins/reproducible.cmake).
// - Release gate for draft emergency cards (plugins/withEmergencyCards.js).
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
const withContentStore = require('./withContentStore');
const withEmergencyCards = require('./withEmergencyCards');
const withThirdPartyNotices = require('./withThirdPartyNotices');
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
    // Reproducible builds: without it the React Native Gradle plugin writes the build host's first IPv4
    // address into the resource react_native_dev_server_ip (resources.arsc differed between CI runners).
    // Debug builds reach Metro through `adb reverse` on localhost.
    setGradleProperty(cfg.modResults, 'reactNativeDevServerIp', 'localhost');
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

// The release JS bundle task only tracks files under apps/mobile, so a change in packages/* or
// modules/* alone left the bundle UP-TO-DATE and shipped stale core code (found in Phase 1c).
// Reproducible native libraries: every Android module with a CMake build (app, llama.rn, op-sqlite,
// React Native and Expo libraries) loads plugins/reproducible.cmake after its project() call
// (--build-id=none, -ffile-prefix-map for the checkout, the Gradle user home and the NDK).
// Libraries: finalizeDsl runs after each module's own android {} block, so a module that assigns its
// arguments list keeps ours. The app: React Native's root plugin evaluates :app before the root build
// script ends, so the root block cannot reach it; app/build.gradle sets the same arguments itself.
const REPRODUCIBLE_MARKER = '// skepi:reproducible-native';
const REPRODUCIBLE_ARGS = `def skepiCmakePath = { File f -> f.canonicalPath.replace('\\\\', '/') }
def skepiReproArgs = [
    "-DCMAKE_PROJECT_INCLUDE=\${skepiCmakePath(new File(rootDir, '../plugins/reproducible.cmake'))}",
    "-DSKEPI_REPRO_REPO_ROOT=\${skepiCmakePath(new File(rootDir, '../../..'))}",
    "-DSKEPI_REPRO_GRADLE_HOME=\${skepiCmakePath(gradle.gradleUserHomeDir)}",
]`;
const withReproducibleNative = (config) => {
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(REPRODUCIBLE_MARKER)) return cfg;
    cfg.modResults.contents += `
${REPRODUCIBLE_MARKER}
${REPRODUCIBLE_ARGS}
subprojects { p ->
    p.plugins.withId('com.android.library') {
        p.extensions.getByName('androidComponents').finalizeDsl { ext ->
            ext.defaultConfig.externalNativeBuild.cmake.arguments.addAll(skepiReproArgs)
        }
    }
}
`;
    return cfg;
  });
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(REPRODUCIBLE_MARKER)) return cfg;
    cfg.modResults.contents += `
${REPRODUCIBLE_MARKER}
${REPRODUCIBLE_ARGS}
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments(*skepiReproArgs)
            }
        }
    }
}
`;
    return cfg;
  });
};

const BUNDLE_INPUTS_MARKER = '// skepi:bundle-inputs';
const withBundleInputs = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(BUNDLE_INPUTS_MARKER)) return cfg;
    cfg.modResults.contents += `
${BUNDLE_INPUTS_MARKER}
tasks.matching { it.name.startsWith('createBundle') && it.name.endsWith('JsAndAssets') }.configureEach { t ->
    ['packages', 'modules'].each { dir ->
        t.inputs.files(fileTree(new File(rootDir, "../../../\${dir}")) {
            include '**/*.ts', '**/*.tsx', '**/*.js', '**/*.json'
            exclude '**/node_modules/**', '**/android/**', '**/build/**', '**/test/**'
        }).withPropertyName("skepiWorkspace_\${dir}")
    }
}
`;
    return cfg;
  });

const SPLITS_MARKER = '// skepi:abi-split';
// APKs: an ABI split with only arm64-v8a. ABI splits do not apply to an AAB, where prebuilt AARs (React
// Native, Hermes, libzim, MapLibre, ...) would add armeabi-v7a/x86/x86_64 copies without the app's own
// native code, and Play would serve those devices a split that crashes. A bundle task therefore turns the
// split off and filters to arm64-v8a instead (the two cannot be combined); APK builds are unchanged.
const withAbiSplit = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(SPLITS_MARKER)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /\nandroid\s*\{\n/,
      `\ndef skepiBundleBuild = gradle.startParameter.taskNames.any { it.toLowerCase().contains('bundle') }
android {
    ${SPLITS_MARKER}
    splits {
        abi {
            enable !skepiBundleBuild
            reset()
            include "${ABI}"
            universalApk false
        }
    }
    if (skepiBundleBuild) {
        defaultConfig.ndk.abiFilters "${ABI}"
    }
`,
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
  return config;
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
  withThirdPartyNotices(withEmergencyCards(withContentStore(withReproducibleNative(withBundleInputs(withAndroidTestPackaging(withDevVariant(
    withReleaseSigning(
      withKeepRules(
        withWindowsCmake(withOfflineManifest(withMapAssets(withLlamaVariants(withAbiSplit(withProperties(config)))))),
      ),
    ),
  )))))));
