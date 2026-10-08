import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * E2E only (`--mode e2e`): serves the small Patras PMTiles fixture with HTTP Range at /e2e-maps/<id>,
 * standing in for the native `maps` protocol (src-tauri/src/protocols.rs).
 */
function e2eMaps(): Plugin {
  const file = fileURLToPath(new URL('./e2e/fixtures/patras.pmtiles', import.meta.url));
  return {
    name: 'skepi-e2e-maps',
    configureServer(server) {
      server.middlewares.use('/e2e-maps', (req, res) => {
        const bytes = readFileSync(file);
        const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
        const start = m ? Number(m[1]) : 0;
        const end = m ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${String(start)}-${String(end)}/${String(bytes.length)}`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(bytes.subarray(start, end + 1));
      });
    },
  };
}

// Tauri dev server: fixed port (tauri.conf.json devUrl), no remote assets; `--mode e2e` swaps the
// native backend for the in-memory mock (src/lib/mock.ts) for Playwright.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'e2e' ? [react(), e2eMaps()] : [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
}));
