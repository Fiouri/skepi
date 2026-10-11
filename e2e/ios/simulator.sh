#!/usr/bin/env bash
# Creates an iPhone Simulator with the newest installed iOS runtime and the newest plain "iPhone <n>"
# device type, and prints its UDID (the runner image decides which ones exist).
#
#   e2e/ios/simulator.sh create <name>
set -euo pipefail

[ "${1:-}" = create ] || { echo "usage: simulator.sh create <name>" >&2; exit 2; }
name="${2:?name}"

type="$(xcrun simctl list devicetypes -j | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const n = (x) => Number(x.split(" ")[1]);
    const t = JSON.parse(s).devicetypes.map((d) => d.name).filter((x) => /^iPhone \d+$/.test(x)).sort((a, b) => n(a) - n(b));
    if (t.length === 0) process.exit(1);
    process.stdout.write(t[t.length - 1]);
  });')"
runtime="$(xcrun simctl list runtimes -j | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const r = JSON.parse(s).runtimes.filter((x) => x.isAvailable && x.platform === "iOS")
      .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
    if (r.length === 0) process.exit(1);
    process.stdout.write(r[r.length - 1].identifier);
  });')"
udid="$(xcrun simctl create "$name" "$type" "$runtime")"
echo "simulator $udid ($type, $runtime)" >&2
echo "$udid"
