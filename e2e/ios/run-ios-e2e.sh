#!/usr/bin/env bash
# Maestro E2E on the iOS Simulator (Phase 3b-0, CI job ios-simulator; also runs on a local Mac).
#
#   e2e/ios/run-ios-e2e.sh <path/to/SKEPI.app>
#
# 1. Boots a fresh Simulator and installs the app (Simulator build, unsigned).
# 2. Provisions the same English packs as the Android E2E (scripts/provision.ps1): Wikipedia top + medicine
#    (mini), the map-gr PMTiles and places-gr packs. URLs and SHA-256 come from the signed release catalog
#    the app embeds (catalog/embedded/release); every file is verified before it is copied, and the app
#    verifies it again at startup before opening it. Downloads are cached in $SKEPI_CACHE_DIR.
# 3. Runs the flows in e2e/ios in order and writes JUnit reports and the list of skipped flows.
set -euo pipefail

app="$(cd "$(dirname "${1:?usage: run-ios-e2e.sh <SKEPI.app>}")" && pwd)/$(basename "$1")"
bundle_id=org.skepi.app
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
out="$repo/e2e/out/ios"
cache="${SKEPI_CACHE_DIR:-$HOME/Library/Caches/skepi}"
maestro="${MAESTRO:-$HOME/.maestro/bin/maestro}"
packs=(wikipedia_en_top_mini wikipedia_en_medicine_mini map-gr places-gr)
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

mkdir -p "$out" "$cache"

# --- Simulator -------------------------------------------------------------------------------
udid="$("$here/simulator.sh" create skepi-e2e)"
cleanup() { xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true; xcrun simctl delete "$udid" >/dev/null 2>&1 || true; }
trap cleanup EXIT
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app"

# --- Packs (verified against the embedded release catalog) -------------------------------------
container="$(xcrun simctl get_app_container "$udid" "$bundle_id" data)"
content="$container/Library/Application Support/skepi"
mkdir -p "$content/zim" "$content/maps"
for id in "${packs[@]}"; do
  read -r file kind sha url < <(node -e '
    const c = require(process.argv[1]); const p = c.packs.find((x) => x.id === process.argv[2]);
    if (!p) { console.error("pack " + process.argv[2] + " is not in the release catalog"); process.exit(1); }
    console.log([p.file, p.kind, p.sha256, p.urls[0]].join(" "));' "$repo/catalog/embedded/release/catalog.json" "$id")
  target="$cache/$file"
  if [ ! -f "$target" ] || [ "$(shasum -a 256 "$target" | cut -d' ' -f1)" != "$sha" ]; then
    echo "downloading $id <- $url"
    curl --fail --location --retry 5 --silent --show-error --output "$target.partial" "$url"
    got="$(shasum -a 256 "$target.partial" | cut -d' ' -f1)"
    if [ "$got" != "$sha" ]; then echo "SHA-256 mismatch for $file ($got, catalog $sha)" >&2; rm -f "$target.partial"; exit 1; fi
    mv "$target.partial" "$target"
  fi
  dir=zim; [ "$kind" = zim ] || dir=maps
  cp "$target" "$content/$dir/$file"
  echo "provisioned $dir/$file (sha256 $sha)"
done

# --- Flows ---------------------------------------------------------------------------------------
cat > "$out/skipped.md" <<'EOF'
| Flow (Android) | Reason on the iOS Simulator |
| --- | --- |
| tools.yaml (SOS torch, compass, GNSS fix, SMS hand-off) | Hardware: the Simulator has no torch, compass or GNSS receiver |
| p2p-host / p2p-receive / station-receive | Not supported on iOS in Phase 3b-0 (no LocalOnlyHotspot; QR camera; P2P arrives later) |
| download.yaml / onboarding-mirror.yaml | Downloads are not supported on iOS in Phase 3b-0 (packs are provisioned or imported) |
| ask-en.yaml AI summary, ask-t1.yaml, medical.yaml AI part, bench-*.yaml, heldout.yaml, parity.yaml | Needs the GGUF model and llama.rn on a device (no model on the Simulator) |
| blackout.yaml / energy.yaml | Battery simulation (dumpsys battery) and battery current are Android-only |
| locale-el.yaml | Frozen locale, optional on Android as well |
| airplane mode in every flow | Maestro cannot toggle it on iOS; this build has no network code path (downloads unsupported, no P2P) |
EOF

cd "$repo" # takeScreenshot paths in the flows are relative to the repository root
failed=0
passed=0
for flow in "$here"/0*.yaml; do
  name="$(basename "$flow" .yaml)"
  echo "=== $name"
  if "$maestro" --device "$udid" test --format junit --output "$out/$name.junit.xml" --test-output-dir "$out/$name" "$flow"; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    xcrun simctl io "$udid" screenshot "$out/$name-failure.png" || true
  fi
done
echo "iOS flows: $passed passed, $failed failed (skipped with reasons: $out/skipped.md)"
xcrun simctl spawn "$udid" log show --last 15m --predicate 'subsystem CONTAINS "skepi" OR eventMessage CONTAINS "[ExpoZim]"' > "$out/app.log" 2>/dev/null || true
[ "$failed" -eq 0 ]
