// Local HTTPS test mirror for the download E2E (debug build org.skepi.app.dev, adb reverse tcp:8443).
//   https://127.0.0.1:8443/packs/<file>     fixture packs (HTTP Range supported)
//   https://127.0.0.1:8443/corrupt/<file>   same size, one byte flipped every 4 KiB (hash mismatch)
//   https://127.0.0.1:8443/catalog/<name>   catalog.json + .sig of the current mode (e2e/mirror/catalogs/<mode>/)
// Admin (host only, never reversed to the phone): http://127.0.0.1:8444/mode/<mode>, /log, /reset.
// Every request is logged (method, path, query, range, user-agent) to e2e/out/mirror-log.jsonl.
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const FIXTURES = join(REPO, 'tools', 'rag-eval', 'fixtures');
const OUT = join(REPO, 'e2e', 'out');
const LOG = join(OUT, 'mirror-log.jsonl');
const PACKS = new Set(['eval-smoke-en.zim', 'eval-smoke-el.zim', 'eval-synthetic.zim', 'eval-heldout.zim']);
const MODES = new Set(['good', 'tampered', 'wrong-key', 'rollback']);
const PORT = Number(process.env.MIRROR_PORT ?? 8443);
const ADMIN_PORT = Number(process.env.MIRROR_ADMIN_PORT ?? 8444);
const RANGE = /^bytes=(\d+)-(\d*)$/;

mkdirSync(OUT, { recursive: true });
let mode = 'good';
const requests = [];

function corrupt(bytes) {
  const out = Buffer.from(bytes);
  for (let i = 0; i < out.length; i += 4096) out[i] ^= 0xff;
  return out;
}

function send(req, res, body, type) {
  const size = body.length;
  const header = req.headers.range ?? '';
  const range = RANGE.test(header) ? header.slice(6).split('-') : null;
  if (range) {
    const start = Number(range[0]);
    const end = range[1] ? Math.min(Number(range[1]), size - 1) : size - 1;
    if (start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return 416;
    }
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' });
    res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
    return 206;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  res.end(req.method === 'HEAD' ? undefined : body);
  return 200;
}

function handle(req, res) {
  const url = new URL(req.url ?? '/', 'https://127.0.0.1');
  const [, area, name] = url.pathname.split('/');
  let status = 404;
  try {
    if ((area === 'packs' || area === 'corrupt') && PACKS.has(name)) {
      const bytes = readFileSync(join(FIXTURES, name));
      status = send(req, res, area === 'corrupt' ? corrupt(bytes) : bytes, 'application/octet-stream');
    } else if (area === 'catalog' && (name === 'catalog.json' || name === 'catalog.json.sig')) {
      const file = join(HERE, 'catalogs', mode, name);
      statSync(file);
      status = send(req, res, readFileSync(file), name.endsWith('.sig') ? 'text/plain' : 'application/json');
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch {
    res.writeHead(404);
    res.end();
  }
  const entry = {
    at: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    query: url.search,
    range: req.headers.range ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    status,
    mode,
  };
  requests.push(entry);
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

const tls = { key: readFileSync(join(HERE, 'certs', 'server.key')), cert: readFileSync(join(HERE, 'certs', 'server.crt')) };
createServer(tls, handle).listen(PORT, '127.0.0.1', () => {
  console.log(`test mirror on https://127.0.0.1:${PORT} (mode ${mode})`);
});

createHttp((req, res) => {
  const [, cmd, arg] = (req.url ?? '/').split('/');
  if (cmd === 'mode' && MODES.has(arg)) {
    mode = arg;
    res.end(JSON.stringify({ mode }));
  } else if (cmd === 'log') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(requests));
  } else if (cmd === 'reset') {
    requests.length = 0;
    mode = 'good';
    res.end('{}');
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(ADMIN_PORT, '127.0.0.1');
