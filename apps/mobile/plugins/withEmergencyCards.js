// Release gate for the bundled emergency cards (CNG: android/ is generated, wired here). Every release
// build runs packages/emergency-cards/scripts/check-release.ts before compiling: it fails unless every
// card step carries its IFRC citation and the steps are exactly the ones the last passed
// tools/cards-source-check verified (packages/emergency-cards/source-check.lock.json; CI re-runs that
// check against the PDF). Right after the JS bundle is built, tools/release-guards cards-bundle checks
// it: no unsourced card text, and every sourced step present (decision 2026-10-21).
// `-PskepiPreview=true` (Developer Preview, with SKEPI_PREVIEW=1 in the environment so that Metro bundles
// the preview entry, apps/mobile/metro.config.js) only adds the "Developer preview" label.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// skepi:emergency-cards';
const GRADLE = `
${MARKER}
def skepiCardsRoot = new File(rootDir, "../../..").canonicalFile
def skepiPreview = (findProperty('skepiPreview') ?: 'false').toString().toBoolean()
if (skepiPreview && System.getenv('SKEPI_PREVIEW') != '1') {
    throw new GradleException('SKEPI: -PskepiPreview=true needs SKEPI_PREVIEW=1 in the environment (Metro reads it; run Gradle with --no-daemon).')
}
def skepiCheckEmergencyCards = tasks.register('skepiCheckEmergencyCards', Exec) {
    workingDir skepiCardsRoot
    commandLine 'node', 'node_modules/tsx/dist/cli.mjs', 'packages/emergency-cards/scripts/check-release.ts'
}
tasks.matching { it.name == 'preReleaseBuild' }.configureEach { dependsOn skepiCheckEmergencyCards }
def skepiCheckCardsBundle = tasks.register('skepiCheckCardsBundle', Exec) {
    workingDir skepiCardsRoot
    commandLine 'node', 'node_modules/tsx/dist/cli.mjs', 'tools/release-guards/src/cards-bundle-cli.ts', '--expect-sourced',
        new File(projectDir, 'build/generated/assets/react/release').absolutePath
}
tasks.matching { it.name == 'createBundleReleaseJsAndAssets' }.configureEach { finalizedBy skepiCheckCardsBundle }
tasks.matching { it.name.startsWith('merge') && it.name.endsWith('ReleaseAssets') }.configureEach { dependsOn skepiCheckCardsBundle }
`;

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += GRADLE;
    return cfg;
  });
