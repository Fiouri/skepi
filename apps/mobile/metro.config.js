// Expo's default Metro configuration (monorepo-aware), plus one switch for Developer Preview builds:
// with SKEPI_PREVIEW=1, `@skepi/emergency-cards` resolves to its preview entry, whose cards carry no
// step text (packages/emergency-cards/src/preview.ts). The release build checks the bundle afterwards
// (apps/mobile/plugins/withEmergencyCards.js -> tools/release-guards preview-cards).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

if (process.env.SKEPI_PREVIEW === '1') {
  const preview = path.resolve(__dirname, '../../packages/emergency-cards/src/preview.ts');
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === '@skepi/emergency-cards') return { type: 'sourceFile', filePath: preview };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
