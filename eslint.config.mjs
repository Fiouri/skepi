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
      'no-restricted-imports': ['error', { paths: NETWORK_MODULES }],
    },
  },
  {
    // The app's ContentStore: the only module that may drive downloads.
    files: ['apps/mobile/src/lib/contentStore.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: NETWORK_MODULES.filter((m) => m.name !== 'expo-content-store') }],
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
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
