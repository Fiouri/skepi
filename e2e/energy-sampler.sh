#!/system/bin/sh
# On-device battery sampler for e2e/run-map-energy.ps1 (runs as the adb shell user, no root needed):
# every INTERVAL seconds one line "epoch current_mA charge_counter_uAh" from dumpsys battery (current
# negative = discharging), then "done". Sampling on the phone keeps Wi-Fi idle during the measurement.
# Usage: sh energy-sampler.sh COUNT INTERVAL OUT
count=$1
interval=$2
out=$3
: > "$out"
i=0
while [ "$i" -lt "$count" ]; do
  b=$(dumpsys battery)
  now=$(echo "$b" | grep -m1 'current now:' | tr -dc '0-9-')
  cc=$(echo "$b" | grep -m1 'Charge counter:' | tr -dc '0-9')
  echo "$(date +%s) $now $cc" >> "$out"
  sleep "$interval"
  i=$((i + 1))
done
echo done >> "$out"
