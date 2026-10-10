// Phase 1d: release gate for the bundled emergency cards (CNG: android/ is generated, wired here).
// A release build runs packages/emergency-cards/scripts/check-release.ts before compiling: it fails on
// any card that is still a draft (not reviewed by first-aid professionals) or breaks the card schema.
// `-PskepiAllowDraftCards=true` lets draft cards through for internal testing builds only; the check
// then prints a loud warning (and Gradle repeats it).
// `-PskepiPreview=true` (Developer Preview, with SKEPI_PREVIEW=1 in the environment so that Metro bundles
// the preview cards, apps/mobile/metro.config.js): the release build ships no step text, and the JS
// bundle is scanned for every card's advice text right after it is built (tools/release-guards).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// skepi:emergency-cards';
const GRADLE = `
${MARKER}
def skepiCardsRoot = new File(rootDir, "../../..").canonicalFile
def skepiAllowDraftCards = (findProperty('skepiAllowDraftCards') ?: 'false').toString().toBoolean()
def skepiPreview = (findProperty('skepiPreview') ?: 'false').toString().toBoolean()
if (skepiPreview && System.getenv('SKEPI_PREVIEW') != '1') {
    throw new GradleException('SKEPI: -PskepiPreview=true needs SKEPI_PREVIEW=1 in the environment (Metro reads it; run Gradle with --no-daemon).')
}
def skepiCheckEmergencyCards = tasks.register('skepiCheckEmergencyCards', Exec) {
    workingDir skepiCardsRoot
    def cmd = ['node', 'node_modules/tsx/dist/cli.mjs', 'packages/emergency-cards/scripts/check-release.ts']
    if (skepiPreview) cmd += ['--preview']
    else if (skepiAllowDraftCards) cmd += ['--allow-draft']
    commandLine cmd
    doFirst {
        if (skepiAllowDraftCards && !skepiPreview) {
            logger.warn('SKEPI WARNING: -PskepiAllowDraftCards=true, DRAFT emergency cards may be bundled. Internal testing build only.')
        }
    }
}
tasks.matching { it.name == 'preReleaseBuild' }.configureEach { dependsOn skepiCheckEmergencyCards }
if (skepiPreview) {
    def skepiCheckPreviewBundle = tasks.register('skepiCheckPreviewBundle', Exec) {
        workingDir skepiCardsRoot
        commandLine 'node', 'node_modules/tsx/dist/cli.mjs', 'tools/release-guards/src/preview-cards-cli.ts',
            new File(projectDir, 'build/generated/assets/react/release').absolutePath
    }
    tasks.matching { it.name == 'createBundleReleaseJsAndAssets' }.configureEach { finalizedBy skepiCheckPreviewBundle }
    tasks.matching { it.name.startsWith('merge') && it.name.endsWith('ReleaseAssets') }.configureEach { dependsOn skepiCheckPreviewBundle }
}
`;

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += GRADLE;
    return cfg;
  });
