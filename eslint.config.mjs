// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const NETWORK = 'Network access only via ContentStore (apps/mobile/src/lib/contentStore.ts).';
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({ name, message: NETWORK }));
const NETWORK_MODULES = [
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dgram',
  'http',
  'https',
  'net',
  'tls',
  'undici',
  'axios',
  'expo-content-store',
].map((name) => ({ name, message: NETWORK }));
const P2P = { name: 'expo-transfer', message: 'Local-network P2P only via apps/mobile/src/lib/transfer.ts (pinned TLS, signed-catalog checks).' };

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/android/**',
      '**/ios/**',
      '**/build/**',
      '**/dist/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.cjs',
      'apps/mobile/plugins/**',
      'modules/*/plugin/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Network access is allowed only inside ContentStore (architecture rule): no fetch/XHR/WebSocket,
      // no Node network modules, and the native downloader (expo-content-store) only from
      // apps/mobile/src/lib/contentStore.ts. Exceptions are listed file by file below.
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-imports': ['error', { paths: [...NETWORK_MODULES, P2P] }],
    },
  },
  {
    // P2P sharing: the second network user, local network only (docs/threat-model.md, "P2P").
    files: ['apps/mobile/src/lib/transfer.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: NETWORK_MODULES }] },
  },
  {
    // The app's ContentStore: the only module that may drive downloads.
    files: ['apps/mobile/src/lib/contentStore.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...NETWORK_MODULES.filter((m) => m.name !== 'expo-content-store'), P2P] }],
    },
  },
  {
    // Dev-machine tooling: official downloads for the signed catalog (never in the app or CI).
    files: ['tools/catalog-builder/src/download.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-imports': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Desktop (Tauri): the webview reaches the native side only through src/lib/ipc.ts (narrow
    // commands); no Tauri plugin APIs from the UI. React hooks rules as on mobile.
    files: ['apps/desktop/src/**/*.{ts,tsx}', 'apps/desktop/e2e/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [...NETWORK_MODULES, P2P],
          patterns: [{ group: ['@tauri-apps/*'], message: 'Native calls only through apps/desktop/src/lib/ipc.ts (narrow commands).' }],
        },
      ],
    },
  },
  {
    files: ['apps/desktop/src/lib/ipc.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: [...NETWORK_MODULES, P2P] }] },
  },
  {
    // Playwright tests and dev tooling (not shipped): Node APIs and the test runner.
    files: ['apps/desktop/e2e/**/*.ts', 'apps/desktop/vite.config.ts', 'apps/desktop/playwright.config.ts', 'apps/desktop/vitest.config.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
