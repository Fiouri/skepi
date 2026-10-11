#!/usr/bin/env bash
# Downloads the pinned official CoreKiwix.xcframework (native/kiwix/corekiwix.lock.json), checks the
# publisher's MD5 and our pinned SHA-256 of the archive and of every library slice, and extracts it to
# $SKEPI_COREKIWIX_DIR (default ~/Library/Caches/skepi/native/corekiwix-<version>). One artifact for
# every Apple target: modules/expo-zim links the iOS slices, crates/zim-ffi the macOS slice.
#
#   native/kiwix/fetch-corekiwix.sh              # verify + extract
#   native/kiwix/fetch-corekiwix.sh --install-ios # also copy it into modules/expo-zim/ios/Frameworks
#
# Neither the podspec nor build.rs downloads anything; both re-check the slice hashes they link.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
lock="$here/corekiwix.lock.json"
field() { node -e 'const l=require(process.argv[1]);const v=process.argv[2].split(".").reduce((o,k)=>o[k],l);process.stdout.write(String(v))' "$lock" "$1"; }

version="$(field version)"
url="$(field url)"
md5_pinned="$(field md5)"
sha_pinned="$(field sha256)"
cache="${SKEPI_CACHE_DIR:-$HOME/Library/Caches/skepi}"
target="${SKEPI_COREKIWIX_DIR:-$HOME/Library/Caches/skepi/native/corekiwix-$version}"
archive="$cache/$(basename "$url")"
mkdir -p "$cache"

sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
md5of() { if command -v md5 >/dev/null; then md5 -q "$1"; else md5sum "$1" | cut -d' ' -f1; fi; }

verify_slices() {
  node -e 'const l=require(process.argv[1]);for(const [k,v] of Object.entries(l.files))console.log(k+" "+v)' "$lock" |
    while read -r rel expected; do
      got="$(sha256 "$1/$rel")"
      if [ "$got" != "$expected" ]; then echo "SHA-256 mismatch for $rel ($got, pinned $expected)" >&2; return 1; fi
    done
}

if [ -d "$target/CoreKiwix.xcframework" ] && verify_slices "$target"; then
  echo "CoreKiwix $version already verified -> $target"
else
  if [ ! -f "$archive" ]; then
    echo "downloading $url"
    curl --fail --location --retry 5 --silent --show-error --user-agent skepi-native-fetch --output "$archive.partial" "$url"
    mv "$archive.partial" "$archive"
  fi
  md5="$(md5of "$archive")"
  sha="$(sha256 "$archive")"
  if [ "$md5" != "$md5_pinned" ]; then echo "MD5 mismatch for $archive ($md5, publisher $md5_pinned)" >&2; rm -f "$archive"; exit 1; fi
  if [ "$sha" != "$sha_pinned" ]; then echo "SHA-256 mismatch for $archive ($sha, pinned $sha_pinned)" >&2; rm -f "$archive"; exit 1; fi
  rm -rf "$target"
  mkdir -p "$target"
  # Archive layout: libkiwix_xcframework-<version>/lib/CoreKiwix.xcframework/...
  tar -xzf "$archive" -C "$target" --strip-components 2
  if ! verify_slices "$target"; then rm -rf "$target"; exit 1; fi
  echo "CoreKiwix $version verified -> $target"
fi

if [ "${1:-}" = "--install-ios" ]; then
  dest="$repo/modules/expo-zim/ios/Frameworks"
  rm -rf "$dest/CoreKiwix.xcframework"
  mkdir -p "$dest"
  # The iOS slices only: the macOS slice is linked by crates/zim-ffi from $target.
  rsync -a --exclude 'macos-*' "$target/CoreKiwix.xcframework" "$dest/"
  echo "installed -> $dest/CoreKiwix.xcframework"
fi
