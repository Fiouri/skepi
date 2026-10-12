#!/usr/bin/env bash
# JDK 21 builds (android-repro CI and the F-Droid recipe; docs/architecture.md, "Android JDK").
# Debian trixie, F-Droid's buildserver, ships only OpenJDK 21, while React Native's Gradle plugin (for its
# own build and, through JdkConfiguratorUtils, for every Kotlin module) and the Expo modules core plugin
# request a JDK 17 toolchain. This switches those toolchain requests to 21, like the fdroiddata React
# Native template does, but leaves every Java source/target at 17; -PskepiJdk21=true keeps the Kotlin
# bytecode target at 17 too (apps/mobile/plugins/withSkepiAndroid.js). Run after `pnpm install`.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
rn="$root/node_modules/@react-native/gradle-plugin"
targets=(
  "$rn"/*/build.gradle.kts
  "$rn/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt"
  "$root/node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle"
)
changed=0
for f in "${targets[@]}"; do
  [ -f "$f" ] || { echo "jdk21.sh: missing $f" >&2; exit 1; }
  if grep -q 'jvmToolchain(17)' "$f"; then
    sed -i 's/jvmToolchain(17)/jvmToolchain(21)/g' "$f"
    echo "jdk21.sh: ${f#"$root"/}: jvmToolchain(21)"
    changed=$((changed + 1))
  fi
done
if grep -rq 'jvmToolchain(17)' "${targets[@]}"; then echo "jdk21.sh: jvmToolchain(17) left" >&2; exit 1; fi
if [ "$changed" -eq 0 ] && ! grep -q 'jvmToolchain(21)' "$rn/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt"; then
  echo "jdk21.sh: no toolchain request found (React Native or Expo changed?)" >&2
  exit 1
fi
echo "jdk21.sh: $changed file(s) switched to the JDK 21 toolchain"
