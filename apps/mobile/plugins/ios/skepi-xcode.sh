#!/bin/bash
# SKEPI build phases of the iOS app (CNG: ios/ is generated; wired by plugins/withSkepiIos.js). The iOS
# counterparts of the Gradle tasks in withContentStore.js and withEmergencyCards.js:
#
#   resources       map style assets (served as asset://map/... from the bundle), the embedded signed
#                   catalog per configuration (Debug: test catalog + test keys + local mirror source;
#                   Release: release catalog + release keys), and in Release:
#                   - the release catalog must verify with the release keys (catalog-builder verify --release);
#                   - the emergency-cards gate: every step IFRC-sourced and exactly the steps the last
#                     passed tools/cards-source-check verified (source-check.lock.json).
#   cards-bundle    Release builds: the JS bundle holds no unsourced card text and every sourced step.
#
# CI also runs `resources` directly with CONFIGURATION=Release on altered cards to prove the gate fails.
set -euo pipefail

mode="${1:?usage: skepi-xcode.sh resources|cards-bundle}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"

# Node as React Native's own build phases find it (ios/.xcode.env, .xcode.env.local).
if [[ -n "${PODS_ROOT:-}" ]]; then
  [[ -f "$PODS_ROOT/../.xcode.env" ]] && source "$PODS_ROOT/../.xcode.env"
  [[ -f "$PODS_ROOT/../.xcode.env.local" ]] && source "$PODS_ROOT/../.xcode.env.local"
fi
node="${NODE_BINARY:-node}"
tsx() { (cd "$repo" && "$node" node_modules/tsx/dist/cli.mjs "$@"); }

release=false
[[ "${CONFIGURATION:-Debug}" == *Release* ]] && release=true
dest="${TARGET_BUILD_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}"

case "$mode" in
  resources)
    if $release; then
      echo "SKEPI: release catalog must verify with the release keys"
      tsx tools/catalog-builder/src/cli.ts verify --release --dir catalog/embedded/release --pinned catalog/keys/release.json
      tsx packages/emergency-cards/scripts/check-release.ts
      embedded=release keys=release.json sources=""
    else
      embedded=debug keys=test.json sources=debug.json
    fi

    mkdir -p "$dest/map" "$dest/catalog"
    rsync -a --delete "$repo/apps/mobile/assets/map/" "$dest/map/"
    rm -f "$dest/catalog/"*
    cp "$repo/catalog/embedded/$embedded/catalog.json" "$repo/catalog/embedded/$embedded/catalog.json.sig" "$dest/catalog/"
    cp "$repo/catalog/keys/$keys" "$dest/catalog/keys.json"
    if [[ -n "$sources" ]]; then cp "$repo/catalog/sources/$sources" "$dest/catalog/sources.json"; fi
    echo "SKEPI: embedded catalog $embedded (keys $keys) and map assets -> $dest"
    ;;
  cards-bundle)
    if $release; then
      # Where React Native's "Bundle React Native code and images" phase writes it (react-native-xcode.sh).
      tsx tools/release-guards/src/cards-bundle-cli.ts --expect-sourced "${CONFIGURATION_BUILD_DIR:-$TARGET_BUILD_DIR}/$UNLOCALIZED_RESOURCES_FOLDER_PATH/main.jsbundle"
    fi
    ;;
  *)
    echo "unknown mode $mode" >&2
    exit 2
    ;;
esac
