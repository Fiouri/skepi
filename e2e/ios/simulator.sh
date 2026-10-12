#!/usr/bin/env bash
# Prints the UDID of an iPhone Simulator with the newest installed iOS runtime and the newest plain
# "iPhone <n>" device type (the runner image decides which ones exist).
#
#   e2e/ios/simulator.sh create <name>   a new device
#   e2e/ios/simulator.sh reuse <name>    a device of that type and runtime the image already has (shut down),
#                                        else a new one: images may ship devices whose first-boot data
#                                        migration is done, a new device pays it (~4 min on CI runners)
set -euo pipefail

mode="${1:-}"
case "$mode" in create | reuse) ;; *) echo "usage: simulator.sh create|reuse <name>" >&2; exit 2 ;; esac
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
udid=""
if [ "$mode" = reuse ]; then
  udid="$(xcrun simctl list devices available -j | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const [runtime, type] = process.argv.slice(1);
      const d = (JSON.parse(s).devices[runtime] ?? []).find((x) => x.name === type && x.state === "Shutdown");
      if (d) process.stdout.write(d.udid);
    });' "$runtime" "$type")"
  [ -n "$udid" ] && echo "simulator $udid ($type, $runtime; from the image)" >&2
fi
if [ -z "$udid" ]; then
  udid="$(xcrun simctl create "$name" "$type" "$runtime")"
  echo "simulator $udid ($type, $runtime; new)" >&2
fi
echo "$udid"
