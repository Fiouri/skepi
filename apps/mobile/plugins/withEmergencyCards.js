// Phase 1d: release gate for the bundled emergency cards (CNG: android/ is generated, wired here).
// A release build runs packages/emergency-cards/scripts/check-release.ts before compiling: it fails on
// any card that is still a draft (not reviewed by first-aid professionals) or breaks the card schema.
// `-PskepiAllowDraftCards=true` lets draft cards through for internal testing builds only; the check
// then prints a loud warning (and Gradle repeats it).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// skepi:emergency-cards';
const GRADLE = `
${MARKER}
def skepiCardsRoot = new File(rootDir, "../../..").canonicalFile
def skepiAllowDraftCards = (findProperty('skepiAllowDraftCards') ?: 'false').toString().toBoolean()
def skepiCheckEmergencyCards = tasks.register('skepiCheckEmergencyCards', Exec) {
    workingDir skepiCardsRoot
    def cmd = ['node', 'node_modules/tsx/dist/cli.mjs', 'packages/emergency-cards/scripts/check-release.ts']
    if (skepiAllowDraftCards) cmd += ['--allow-draft']
    commandLine cmd
    doFirst {
        if (skepiAllowDraftCards) {
            logger.warn('SKEPI WARNING: -PskepiAllowDraftCards=true, DRAFT emergency cards may be bundled. Internal testing build only.')
        }
    }
}
tasks.matching { it.name == 'preReleaseBuild' }.configureEach { dependsOn skepiCheckEmergencyCards }
`;

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += GRADLE;
    return cfg;
  });
