#!/usr/bin/env bash
# `fdroid build` of docs/fdroid/org.skepi.app.yml at one commit, the way fdroiddata's own CI job does it
# ("fdroid build" in https://gitlab.com/fdroid/fdroiddata/-/blob/master/.gitlab-ci.yml): inside
# registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie as root, Debian's OpenJDK 21, fdroidserver
# pinned to the commit fdroiddata uses, the build itself as user vagrant with --on-server.
# Called by .github/workflows/android-repro.yml (job fdroid-build). Inputs (environment):
#   APP_COMMIT  commit to build (must be reachable from REPO_URL); when the recipe has a build of exactly
#               this commit (a released tag), its versionName/versionCode are kept, else app.json's
#   REPO_URL    git URL of the repository
#   SRC         read-only checkout holding the recipe and apps/mobile/app.json (default /src)
#   OUT         output directory: the unsigned APK, the CI recipe and the build log (default /out)
set -euo pipefail
SRC=${SRC:-/src}
OUT=${OUT:-/out}
# fdroiddata pins fdroidserver to this commit (.install_fdroid_server); update both together.
FDROIDSERVER_COMMIT=a35fdfddd9c66823987a410566a6101186e39c84
# fdroiddata's srclibs the recipe names (srclibs:), from a pinned fdroiddata commit, SHA-256 checked.
FDROIDDATA_COMMIT=7a03a6faabd90cd31b2931438ac030ae60c5d8b2
declare -A SRCLIB_SHA256=(
  [esbuild]=bf4763068e614bdf727c0f963269479283826bf497fc61370dc7edb629eb6b2e
)
: "${APP_COMMIT:?}" "${REPO_URL:?}"

set +u
# shellcheck disable=SC1091
source /etc/profile.d/bsenv.sh # ANDROID_HOME, home_vagrant, fdroidserver
set -u
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q sudo openjdk-21-jdk-headless git python3 curl > /dev/null
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
java -version 2>&1 | head -n 1
sdkmanager "platform-tools" "build-tools;31.0.0" > /dev/null

rm -rf "$fdroidserver"
git clone -q --shallow-since=2026-07-13 https://gitlab.com/fdroid/fdroidserver.git "$fdroidserver"
git -C "$fdroidserver" config transfer.fsckObjects true
git -C "$fdroidserver" checkout -q -B master "$FDROIDSERVER_COMMIT"
git -C "$home_vagrant/gradlew-fdroid" pull -q

# A minimal fdroiddata tree: the recipe with this commit and version, no Binaries: (the comparison with
# the android-repro artifact is done by the workflow, not by fdroid build), and the srclibs it names.
read -r version code < <(awk -v c="$APP_COMMIT" '/^  - versionName:/ { v = $3 } /^    versionCode:/ { k = $2 }
  $1 == "commit:" && $2 == c { print v, k; exit }' "$SRC/docs/fdroid/org.skepi.app.yml") || true
if [ -z "${code:-}" ]; then
  version=$(python3 -c "import json;print(json.load(open('$SRC/apps/mobile/app.json'))['expo']['version'])")
  code=$(python3 -c "import json;print(json.load(open('$SRC/apps/mobile/app.json'))['expo']['android']['versionCode'])")
fi
echo "building org.skepi.app $version ($code) at $APP_COMMIT"
mkdir -p "$home_vagrant/metadata" "$home_vagrant/config" "$home_vagrant/tmp" "$home_vagrant/unsigned" \
  "$home_vagrant/logs" "$home_vagrant/build" "$home_vagrant/.gradle" "$home_vagrant/.android" \
  "$home_vagrant/srclibs"
while read -r lib; do
  [ -n "${SRCLIB_SHA256[$lib]:-}" ] || { echo "srclib $lib has no pinned SHA-256 in fdroid-build.sh"; exit 1; }
  curl -fsSL -o "$home_vagrant/srclibs/$lib.yml" "https://gitlab.com/fdroid/fdroiddata/-/raw/$FDROIDDATA_COMMIT/srclibs/$lib.yml"
  echo "${SRCLIB_SHA256[$lib]}  $home_vagrant/srclibs/$lib.yml" | sha256sum -c -
done < <(sed -n '/^    srclibs:/,/^    [a-z]/s/^      - \([A-Za-z0-9_-]*\)@.*/\1/p' "$SRC/docs/fdroid/org.skepi.app.yml")
recipe="$home_vagrant/metadata/org.skepi.app.yml"
sed -e "s|^Repo: .*|Repo: $REPO_URL|" \
    -e '/^Binaries:/d' \
    -e "s|^\(    commit:\) .*|\1 $APP_COMMIT|" \
    -e "s|^\(  - versionName:\) .*|\1 $version|" \
    -e "s|^\(    versionCode:\) .*|\1 $code|" \
    -e "s|^CurrentVersion: .*|CurrentVersion: $version|" \
    -e "s|^CurrentVersionCode: .*|CurrentVersionCode: $code|" \
    "$SRC/docs/fdroid/org.skepi.app.yml" > "$recipe"
printf 'Reading: {}\nScience & Education: {}\n' > "$home_vagrant/config/categories.yml"
printf -- '---\nrefresh_scanner: true\n' > "$home_vagrant/config.yml"
cp "$recipe" "$OUT/org.skepi.app.ci.yml"
cat "$recipe"
chown -R vagrant "$home_vagrant"

cd "$home_vagrant"
fdroid() {
  sudo --preserve-env --user vagrant \
    env PATH="$fdroidserver:$PATH" PYTHONPATH="$fdroidserver:$fdroidserver/examples" PYTHONUNBUFFERED=true \
    HOME="$home_vagrant" GRADLE_USER_HOME="$home_vagrant/.gradle" \
    fdroid "$@"
}
# The recipe as submitted, the way fdroiddata's CI checks it (merge request 53588 failed "fdroid
# rewritemeta" and "checkupdates" on 2026-10-22): formatting, lint, and a version found at the tags
# (checkupdates exits 0 on failure and logs an ERROR).
meta="$home_vagrant/meta-check"
mkdir -p "$meta/metadata" "$meta/config"
cp "$SRC/docs/fdroid/org.skepi.app.yml" "$meta/metadata/"
cp "$home_vagrant/config/categories.yml" "$meta/config/"
cp -r "$home_vagrant/srclibs" "$meta/"
printf -- '---\n' > "$meta/config.yml"
git -C "$meta" init -q
chown -R vagrant "$meta"
(cd "$meta" && fdroid rewritemeta org.skepi.app)
diff -u "$SRC/docs/fdroid/org.skepi.app.yml" "$meta/metadata/org.skepi.app.yml" ||
  { echo "docs/fdroid/org.skepi.app.yml is not in fdroid rewritemeta format (diff above)"; exit 1; }
(cd "$meta" && fdroid lint org.skepi.app)
(cd "$meta" && fdroid checkupdates --verbose --allow-dirty org.skepi.app) 2>&1 | tee "$OUT/checkupdates.log" | grep -E 'UpdateCheckData found|ERROR' || true
if grep -q 'ERROR' "$OUT/checkupdates.log" || ! grep -q 'UpdateCheckData found version' "$OUT/checkupdates.log"; then
  echo "fdroid checkupdates found no version (see checkupdates.log)"; exit 1
fi

# --on-server builds the checkout in build/org.skepi.app and does not set up srclibs; fdroiddata CI runs
# fdroidserver's fetchsrclibs plugin (examples/fdroid_fetchsrclibs.py) for both.
fdroid fetch_repo "org.skepi.app:$code" --verbose
fdroid fetchsrclibs "org.skepi.app:$code" --verbose
set +e
(unset CI; fdroid build --verbose --test --refresh-scanner --on-server --no-tarball "org.skepi.app:$code") 2>&1 | tee "$OUT/fdroid-build.log"
rc=${PIPESTATUS[0]}
set -e
cp -r "$home_vagrant/logs" "$OUT/logs" 2>/dev/null || true
if [ "$rc" -ne 0 ]; then echo "fdroid build failed ($rc)"; exit "$rc"; fi
apk="$home_vagrant/tmp/org.skepi.app_${code}.apk"
[ -f "$apk" ] || { echo "no output at $apk"; ls -la "$home_vagrant/tmp"; exit 1; }
cp "$apk" "$OUT/"
sha256sum "$apk"

# The prebuilt esbuild binary is deleted by scandelete (not scanignored), so tsx in the Gradle build ran
# the srclib build (ESBUILD_BINARY_PATH); fdroiddata review of MR 53588, 2026-10-22.
grep -q 'Removing .* at node_modules/@esbuild/linux-x64/bin/esbuild' "$OUT/fdroid-build.log" ||
  { echo "scandelete did not remove node_modules/@esbuild/linux-x64/bin/esbuild"; exit 1; }
if grep -q 'Ignoring binary at node_modules/@esbuild' "$OUT/fdroid-build.log"; then
  echo "the prebuilt esbuild is still scanignored"; exit 1
fi
# fdroid scanner on the unsigned APK, as F-Droid runs it on built APKs.
(cd "$home_vagrant" && fdroid scanner --exit-code --verbose "$apk") 2>&1 | tee "$OUT/scanner-apk.log"
