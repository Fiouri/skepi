// Egress check of the real macOS build (Phase 3b-0), the counterpart of egress.mjs on Windows: the app
// starts directly with a fresh data folder, stays idle, and every ~500 ms `lsof` lists the internet
// sockets of the app process and of the WebKit processes that appeared after it started (WKWebView
// runs its networking and content in XPC services that are not children of the app; on a CI runner
// nothing else uses WebKit). At the end `nettop` reports the bytes those processes moved on external
// interfaces (it also counts connections too short for a sample). The app is not driven: tauri-driver
// does not support macOS (WKWebView has no WebDriver), so this is the idle phase only.
// Commands run through execFileSync with argument arrays (no shell).
//
//   node apps/desktop/e2e/egress-macos.mjs --app <SKEPI.app> --out e2e/out/egress-macos [--idle 90] [--expect-none]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const appBundle = resolve(opt('app', 'target/aarch64-apple-darwin/release/bundle/macos/SKEPI.app'));
const out = resolve(opt('out', 'e2e/out/egress-macos'));
const idleS = Number(opt('idle', '90'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return typeof e.stdout === 'string' ? e.stdout : '';
  }
};

const macos = join(appBundle, 'Contents', 'MacOS');
const exe = join(macos, readdirSync(macos)[0]);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const appData = join(out, 'appdata');

/** pid -> command name of every WebKit process (XPC services of WKWebView). */
const webkitProcesses = () => {
  const map = new Map();
  for (const line of run('ps', ['-axo', 'pid=,comm=']).split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && m[2].includes('com.apple.WebKit')) map.set(Number(m[1]), m[2].split('/').pop());
  }
  return map;
};
const before = new Set(webkitProcesses().keys());

const startT = Date.now();
const app = spawn(exe, [], { env: { ...process.env, SKEPI_APP_DATA: appData, SKEPI_CONTENT_ROOT: join(appData, 'content') }, stdio: 'ignore' });
let exited = null;
app.on('exit', (code, signal) => {
  exited = { code, signal };
});

const loopback = /^(127\.|\[?::1\]?|localhost)/;
const endpoints = new Map();
const processes = new Map([[app.pid, 'skepi-desktop']]);
let samples = 0;
while (Date.now() - startT < idleS * 1000) {
  for (const [pid, name] of webkitProcesses()) if (!before.has(pid)) processes.set(pid, name);
  const pids = [...processes.keys()].join(',');
  // -a: AND of the selections (these pids and internet sockets); -n/-P: no name or port lookups.
  for (const line of run('lsof', ['-nP', '-a', '-p', pids, '-i']).split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const name = cols.slice(8).join(' ');
    const arrow = name.indexOf('->');
    if (arrow < 0) continue; // listening or unconnected sockets
    const remote = name.slice(arrow + 2).split(' ')[0];
    if (loopback.test(remote)) continue;
    const key = `${cols[1]} ${remote}`;
    if (!endpoints.has(key)) endpoints.set(key, { process: processes.get(Number(cols[1])) ?? cols[0], pid: Number(cols[1]), proto: cols[7], remote, firstS: (Date.now() - startT) / 1000 });
  }
  samples += 1;
  await sleep(500);
}

// Bytes on external interfaces per process since it started (loopback excluded by -t external).
const traffic = [];
const nettop = run('nettop', ['-P', '-L', '1', '-x', '-t', 'external', '-J', 'bytes_in,bytes_out']);
for (const line of nettop.split('\n').slice(1)) {
  const [name, bytesIn, bytesOut] = line.split(',');
  const pid = Number((name ?? '').split('.').pop());
  if (processes.has(pid) && (Number(bytesIn) > 0 || Number(bytesOut) > 0)) traffic.push({ process: name, bytesIn: Number(bytesIn), bytesOut: Number(bytesOut) });
}

const alive = exited === null;
app.kill('SIGTERM');
await sleep(2000);
const started = existsSync(join(appData, 'app.db'));
const rows = [...endpoints.values()];
const result = { app: appBundle, idleS, samples, processes: Object.fromEntries(processes), alive, started, nettopAvailable: nettop.length > 0, sockets: rows, traffic };
writeFileSync(join(out, 'egress.json'), JSON.stringify(result, null, 2));
const md = [
  `# Egress (macOS) · ${new Date(startT).toISOString()}`,
  '',
  `App: \`${appBundle}\` · idle ${String(idleS)} s · ${String(samples)} lsof samples · processes: ${[...processes.values()].join(', ')}`,
  `App alive after the idle phase: ${alive ? 'yes' : `no (${JSON.stringify(exited)})`} · app.db created: ${started ? 'yes' : 'no'}`,
  '',
  rows.length === 0 ? '**No socket connected outside loopback (lsof).**' : '| First seen | Process | Proto | Remote |\n| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.firstS.toFixed(1)} s | ${r.process} (${String(r.pid)}) | ${r.proto} | ${r.remote} |`),
  '',
  nettop.length === 0 ? 'nettop: not available on this runner.' : traffic.length === 0 ? '**No bytes on external interfaces (nettop).**' : `nettop: ${JSON.stringify(traffic)}`,
  '',
];
writeFileSync(join(out, 'egress.md'), md.join('\n'));
console.log(md.join('\n'));

if (argv.includes('--expect-none')) {
  const ok = rows.length === 0 && traffic.length === 0 && samples > 0 && alive && started;
  console.log(ok ? 'EGRESS PASS: the app started, stayed up and made no connection outside loopback' : 'EGRESS FAIL');
  process.exit(ok ? 0 : 1);
}
