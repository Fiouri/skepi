// iOS build customisations (Phase 3b-0; CNG: ios/ is generated, never edited by hand). No signing here:
// CI builds for the Simulator with CODE_SIGNING_ALLOWED=NO.
// - llama.rn compiled from source (RNLLAMA_BUILD_FROM_SOURCE=1), as on Android (no prebuilt download).
// - SkepiZim (modules/expo-zim/ios) with its XCTest spec, so `xcodebuild test -scheme SkepiZim-Unit-Tests`
//   runs the binding, catalog/hash and viewer-sealing tests on a Simulator.
// - Build phases (plugins/ios/skepi-xcode.sh): map assets and the embedded signed catalog per configuration,
//   the release catalog check, the draft emergency-cards gate (Release) and, with SKEPI_PREVIEW=1, the scan
//   of the built JS bundle for card advice text: the iOS counterparts of withContentStore.js and
//   withEmergencyCards.js.
const { withPodfile, withXcodeProject } = require('expo/config-plugins');

const PODFILE_MARKER = '# skepi:ios';
const ZIM_POD = "  pod 'SkepiZim', :path => '../../../modules/expo-zim/ios', :testspecs => ['Tests']";

const withIosPodfile = (config) =>
  withPodfile(config, (cfg) => {
    let text = cfg.modResults.contents;
    if (text.includes(PODFILE_MARKER)) return cfg;
    text = `${PODFILE_MARKER}: llama.rn from source (no prebuilt binaries), like rnllamaBuildFromSource on Android.
ENV['RNLLAMA_BUILD_FROM_SOURCE'] = '1'
${text}`;
    if (!/^\s*use_expo_modules!/m.test(text)) throw new Error('withSkepiIos: use_expo_modules! not found in the Podfile');
    // Added before autolinking, which then keeps this declaration (and its test spec).
    text = text.replace(/^(\s*)use_expo_modules!/m, `${ZIM_POD}\n$1use_expo_modules!`);
    cfg.modResults.contents = text;
    return cfg;
  });

const PHASES = [
  { name: '[SKEPI] Resources and release checks', mode: 'resources', first: true },
  { name: '[SKEPI] Preview bundle check', mode: 'preview-bundle', first: false },
];

const withIosBuildPhases = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const { uuid: targetUuid, firstTarget } = project.getFirstTarget();
    const existing = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const phase of PHASES) {
      const quoted = `"${phase.name}"`;
      if (Object.values(existing).some((p) => typeof p === 'object' && (p.name === quoted || p.name === phase.name))) continue;
      const { uuid, buildPhase } = project.addBuildPhase([], 'PBXShellScriptBuildPhase', phase.name, targetUuid, {
        shellPath: '/bin/sh',
        shellScript: `bash "\${SRCROOT}/../plugins/ios/skepi-xcode.sh" ${phase.mode}`,
      });
      buildPhase.alwaysOutOfDate = 1;
      if (phase.first) {
        const list = firstTarget.buildPhases;
        const index = list.findIndex((p) => p.value === uuid);
        const [entry] = list.splice(index, 1);
        list.unshift(entry);
      }
    }
    return cfg;
  });

module.exports = (config) => withIosBuildPhases(withIosPodfile(config));
