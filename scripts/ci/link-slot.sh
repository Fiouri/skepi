#!/usr/bin/env bash
# Linker launcher for CI native builds (CMAKE_C_LINKER_LAUNCHER / CMAKE_CXX_LINKER_LAUNCHER, read from
# the environment by CMake >= 3.21): runs the link command while holding one of SKEPI_LINK_SLOTS slots
# (default 2), so parallel ninja jobs never run more links at once than that. With a warm ccache every
# compile returns at once and llama.rn's variant libraries all linked together: 5+ ld.lld processes of
# ~2.4 GB each exhausted the runner's 16 GB RAM and 10 GB swap (android-release-guards, Phase 3a).
set -u
if ! command -v flock > /dev/null 2>&1; then
  echo "link-slot.sh: flock not found, linking without a slot" >&2
  exec "$@"
fi
slots=${SKEPI_LINK_SLOTS:-2}
dir=${RUNNER_TEMP:-/tmp}
while true; do
  for i in $(seq 1 "$slots"); do
    exec {fd}>"$dir/skepi-link-$i.lock"
    if flock -n "$fd"; then
      # The lock is released when this process exits.
      "$@"
      exit $?
    fi
    exec {fd}>&-
  done
  sleep 1
done
