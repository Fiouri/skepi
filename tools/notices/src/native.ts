import { CDC_DISCLAIMER, FEMA_DISCLAIMER, IFRC_ATTRIBUTION, IFRC_GUIDELINES, WEB_SOURCES } from '@skepi/emergency-cards';
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

const pages = (attribution: string): string =>
  WEB_SOURCES.filter((w) => w.attribution === attribution)
    .map((w) => `“${w.title}”, ${w.url} (retrieved ${w.accessed})`)
    .join('; ');

/**
 * Bundled content under its own terms, with the notice text shown in About: the emergency-card steps are
 * verbatim excerpts of the IFRC guidelines (non-commercial use, source acknowledged) and of CDC and FEMA
 * Ready.gov pages (US federal public domain; attribution, no alteration, no implied endorsement).
 */
export const CONTENT: readonly { component: Omit<Component, 'texts'>; text: string }[] = [
  {
    component: {
      ecosystem: 'native',
      name: `Emergency card text: IFRC ${IFRC_GUIDELINES.title} ${IFRC_GUIDELINES.edition}`,
      version: IFRC_GUIDELINES.edition,
      license: 'IFRC: non-commercial use, providing the source is acknowledged',
      url: IFRC_GUIDELINES.url,
    },
    text: `${IFRC_ATTRIBUTION}\n\nThe IFRC would appreciate receiving details of its use. Requests for commercial reproduction should be directed to the IFRC at secretariat@ifrc.org.\n\nS.K.E.P.I. is free and non-commercial. The card steps are quoted word for word; each card cites the section and page. The IFRC does not endorse S.K.E.P.I.`,
  },
  {
    component: {
      ecosystem: 'native',
      name: 'Emergency card text: CDC, How to Make Water Safe in an Emergency',
      version: WEB_SOURCES.find((w) => w.id === 'cdc-water')?.accessed ?? '',
      license: 'Public domain (U.S. Government work); CDC terms for the use of agency materials',
      url: 'https://www.cdc.gov/other/agencymaterials.html',
    },
    text: `Source: CDC. ${pages('Source: CDC')}.\n\n${CDC_DISCLAIMER}\n\nTerms: https://www.cdc.gov/other/agencymaterials.html. The steps of the water card are quoted word for word, without change to their content; passages specific to the United States are left out. No CDC, HHS or U.S. Government logo is used.`,
  },
  {
    component: {
      ecosystem: 'native',
      name: 'Emergency card text: FEMA Ready.gov (Earthquakes, Home Fires, Wildfires, Floods)',
      version: WEB_SOURCES.find((w) => w.id === 'ready-floods')?.accessed ?? '',
      license: 'Public domain (U.S. Government work); Ready.gov reprint terms of use',
      url: 'https://www.ready.gov/publications',
    },
    text: `Source: FEMA, Ready.gov. ${pages('Source: FEMA, Ready.gov')}.\n\n${FEMA_DISCLAIMER}\n\nReprint terms: https://www.ready.gov/publications. The steps of the earthquake, fire and flood cards are quoted word for word; passages specific to the United States (such as calling 9-1-1, US agencies and programmes) are left out, never edited. No FEMA or U.S. Government logo is used.`,
  },
];
