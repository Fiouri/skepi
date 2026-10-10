import type { Component } from './notices';

/**
 * Native libraries the apps ship that package metadata does not list on its own (static or vendored
 * inside a crate, an AAR or a DLL). Versions and licences as pinned in the repository (native/kiwix,
 * scripts/content.lock.json, Cargo.lock, the React Native packages).
 */
export const NATIVE_DESKTOP: readonly Omit<Component, 'texts'>[] = [
  { ecosystem: 'native', name: 'libzim', version: '9.7.0', license: 'GPL-2.0-or-later', url: 'https://github.com/openzim/libzim' },
  { ecosystem: 'native', name: 'ICU (icudt74, icuin74, icuuc74)', version: '74', license: 'Unicode-3.0', url: 'https://icu.unicode.org/' },
  { ecosystem: 'native', name: 'Xapian (static in zim-9.dll)', version: '1.4', license: 'GPL-2.0-or-later', url: 'https://xapian.org/' },
  { ecosystem: 'native', name: 'Zstandard (static in zim-9.dll)', version: '1.5', license: 'BSD-3-Clause OR GPL-2.0-only', url: 'https://github.com/facebook/zstd' },
  { ecosystem: 'native', name: 'llama.cpp / ggml (in llama-cpp-sys-2)', version: 'llama-cpp-sys-2 0.1.159', license: 'MIT', url: 'https://github.com/ggml-org/llama.cpp' },
  { ecosystem: 'native', name: 'SQLCipher (in libsqlite3-sys)', version: '4', license: 'BSD-3-Clause', url: 'https://www.zetetic.net/sqlcipher/' },
  { ecosystem: 'native', name: 'OpenSSL (vendored, in openssl-src)', version: '3', license: 'Apache-2.0', url: 'https://www.openssl.org/' },
  {
    ecosystem: 'native',
    name: 'Microsoft Visual C++ runtime (msvcp140, vcruntime140, vcruntime140_1)',
    version: '14',
    license: 'Microsoft Visual C++ Redistributable licence terms',
    url: 'https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files',
  },
  {
    ecosystem: 'native',
    name: 'Microsoft Edge WebView2 Runtime (not shipped: installed by Windows or by its bootstrapper)',
    version: 'evergreen',
    license: 'Microsoft software licence terms',
    url: 'https://developer.microsoft.com/microsoft-edge/webview2/',
  },
];

export const NATIVE_MOBILE: readonly Omit<Component, 'texts'>[] = [
  { ecosystem: 'native', name: 'libkiwix / libzim (java-libkiwix AAR)', version: 'see the Maven entry', license: 'GPL-3.0-or-later (libkiwix), GPL-2.0-or-later (libzim)', url: 'https://github.com/kiwix/java-libkiwix' },
  { ecosystem: 'native', name: 'ICU, Xapian, Zstandard (in the libkiwix AAR)', version: '—', license: 'Unicode-3.0; GPL-2.0-or-later; BSD-3-Clause OR GPL-2.0-only', url: 'https://github.com/kiwix/kiwix-build' },
  { ecosystem: 'native', name: 'llama.cpp / ggml (built from source by llama.rn)', version: 'see llama.rn', license: 'MIT', url: 'https://github.com/ggml-org/llama.cpp' },
  { ecosystem: 'native', name: 'SQLCipher (in @op-engineering/op-sqlite)', version: '4', license: 'BSD-3-Clause', url: 'https://www.zetetic.net/sqlcipher/' },
  { ecosystem: 'native', name: 'Hermes JavaScript engine (in react-native)', version: 'see react-native', license: 'MIT', url: 'https://github.com/facebook/hermes' },
];

/** Bundled data, fonts and models that are not software packages (also on the About screen). */
export const ASSETS: readonly Omit<Component, 'texts'>[] = [
  { ecosystem: 'native', name: 'Noto Sans map glyphs (protomaps/basemaps-assets)', version: '028c18f', license: 'OFL-1.1', url: 'https://github.com/protomaps/basemaps-assets' },
  { ecosystem: 'native', name: 'Map sprites (protomaps/basemaps-assets, from tangrams/icons)', version: '028c18f', license: 'MIT', url: 'https://github.com/tangrams/icons' },
  { ecosystem: 'native', name: 'Protomaps basemap style', version: '5.7.2', license: 'BSD-3-Clause (code), CC0-1.0 (visual design)', url: 'https://github.com/protomaps/basemaps' },
];
