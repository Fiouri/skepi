#!/bin/bash
# SKEPI build phases of the iOS app (CNG: ios/ is generated; wired by plugins/withSkepiIos.js). The iOS
# counterparts of the Gradle tasks in withContentStore.js and withEmergencyCards.js:
#
#   resources       map style assets (served as asset://map/... from the bundle), the embedded signed
#                   catalog per configuration (Debug: test catalog + test keys + local mirror source;
#                   Release: release catalog + release keys), and in Release:
#                   - the release catalog must verify with the release keys (catalog-builder verify --release);
#                   - the draft emergency-cards gate: fails with draft cards, unless SKEPI_PREVIEW=1 (preview
#                     cards, no step text) or SKEPI_ALLOW_DRAFT_CARDS=1 (internal testing builds only).
#   preview-bundle  SKEPI_PREVIEW=1 Release builds: the JS bundle must hold no card advice text.
#
# CI also runs `resources` directly with CONFIGURATION=Release to prove the draft gate fails.
set -euo pipefail

mode="${1:?usage: skepi-xcode.sh resources|preview-bundle}"
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
      cards=()
      if [[ "${SKEPI_PREVIEW:-}" == "1" ]]; then
        cards+=(--preview)
      elif [[ "${SKEPI_ALLOW_DRAFT_CARDS:-}" == "1" ]]; then
        echo "warning: SKEPI WARNING: SKEPI_ALLOW_DRAFT_CARDS=1, DRAFT emergency cards may be bundled. Internal testing build only."
        cards+=(--allow-draft)
      fi
      tsx packages/emergency-cards/scripts/check-release.ts ${cards[@]+"${cards[@]}"}
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
  preview-bundle)
    if $release && [[ "${SKEPI_PREVIEW:-}" == "1" ]]; then
      # Where React Native's "Bundle React Native code and images" phase writes it (react-native-xcode.sh).
      tsx tools/release-guards/src/preview-cards-cli.ts "${CONFIGURATION_BUILD_DIR:-$TARGET_BUILD_DIR}/$UNLOCALIZED_RESOURCES_FOLDER_PATH/main.jsbundle"
    fi
    ;;
  *)
    echo "unknown mode $mode" >&2
    exit 2
    ;;
esac
