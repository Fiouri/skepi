// Egress measurement of the real Windows build, online: the app starts directly (no WebDriver, so the
// WebView2 runtime runs with the app's own browser arguments and a fresh data folder), stays idle, is
// used through UI Automation (egress-drive.ps1), then idles again. egress-sampler.ps1 records every
// non-loopback endpoint of the skepi-desktop.exe process tree; remote addresses are named from the
// Windows DNS cache (what the processes resolved) and reverse DNS.
//
//   node apps/desktop/e2e/egress.mjs --app target/release/skepi-desktop.exe --out e2e/out/egress-after
//        [--idle 120] [--tail 60] [--no-use] [--expect-none] [--browser-args "<WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS>"]
//
// --browser-args overrides the app's arguments through the WebView2 environment variable (to measure
// a "before" configuration with the same binary).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from './webdriver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const app = resolve(opt('app', 'target/release/skepi-desktop.exe'));
const out = resolve(opt('out', 'e2e/out/egress'));
const idleS = Number(opt('idle', '120'));
const tailS = Number(opt('tail', '60'));
const use = !argv.includes('--no-use');
const browserArgs = opt('browser-args', undefined);
const content = resolve(opt('content', join(process.env.LOCALAPPDATA ?? '', 'skepi', 'e2e-desktop', 'content')));

const ps = (script) => execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', env: { ...process.env, PSModulePath: '' }, maxBuffer: 64 * 1024 * 1024 });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const samplesFile = join(out, 'samples.jsonl');
const stopFile = join(out, 'stop');
const sampler = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'egress-sampler.ps1'), '-Out', samplesFile, '-StopFile', stopFile], {
  env: { ...process.env, PSModulePath: '' },
  stdio: 'inherit',
});

const marks = [];
const mark = (phase) => {
  marks.push({ phase, t: Date.now() });
  console.log(`[egress] ${phase}`);
};

const env = { ...process.env, SKEPI_CONTENT_ROOT: content, SKEPI_APP_DATA: join(out, 'appdata') };
if (browserArgs !== undefined) env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = browserArgs;
else delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;

await sleep(3000);
mark('start');
const proc = spawn(app, [], { env, stdio: 'ignore' });
await sleep(idleS * 1000);
if (use) {
  mark('use');
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'egress-drive.ps1'), '-AppPid', String(proc.pid)], {
      env: { ...process.env, PSModulePath: '' },
      stdio: 'inherit',
      timeout: 900_000,
    });
  } catch (e) {
    mark(`use failed: ${e.message.split('\n')[0]}`);
  }
  mark('tail');
  await sleep(tailS * 1000);
}
mark('stop');
try {
  execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
} catch {
  // already gone
}
await sleep(3000);
writeFileSync(stopFile, '');
await new Promise((r) => sampler.on('exit', r));

// Name the remote addresses: the DNS cache (A/AAAA records and the names that led to them), then PTR.
const dns = JSON.parse(ps('@(Get-DnsClientCache -ErrorAction SilentlyContinue | Select-Object Entry, Name, Type, Data) | ConvertTo-Json -Compress') || '[]');
const namesByIp = new Map();
for (const r of Array.isArray(dns) ? dns : [dns]) {
  if (!r || (r.Type !== 1 && r.Type !== 28)) continue;
  const set = namesByIp.get(r.Data) ?? new Set();
  set.add(r.Entry);
  if (r.Name && r.Name !== r.Entry) set.add(r.Name);
  namesByIp.set(r.Data, set);
}

const phaseAt = (t) => [...marks].reverse().find((m) => m.t <= t)?.phase ?? 'before start';
const endpoints = new Map();
const udp = new Map();
let sampleCount = 0;
let maxProcesses = 0;
const startT = marks[0].t;
for (const line of existsSync(samplesFile) ? readFileSync(samplesFile, 'utf8').split('\n') : []) {
  if (!line.trim()) continue;
  const s = JSON.parse(line.charCodeAt(0) === 0xfeff ? line.slice(1) : line);
  sampleCount += 1;
  maxProcesses = Math.max(maxProcesses, s.processes);
  for (const r of [s.rows ?? []].flat()) {
    if (r.proto === 'udp') {
      const k = `${r.process} ${r.type} :${String(r.port)}`;
      if (!udp.has(k)) udp.set(k, { ...r, firstS: (s.t - startT) / 1000, phase: phaseAt(s.t) });
      continue;
    }
    const k = `${r.remote}:${String(r.port)} ${r.type}`;
    const e = endpoints.get(k) ?? { remote: r.remote, port: r.port, process: r.process, type: r.type, states: new Set(), phases: new Set(), firstS: (s.t - startT) / 1000, lastS: 0 };
    e.states.add(r.state);
    e.phases.add(phaseAt(s.t));
    e.lastS = (s.t - startT) / 1000;
    endpoints.set(k, e);
  }
}
const ptr = (ip) => {
  try {
    return ps(`(Resolve-DnsName -Type PTR -DnsOnly -QuickTimeout '${ip}' -ErrorAction Stop | Where-Object Type -eq 'PTR' | Select-Object -First 1).NameHost`).trim();
  } catch {
    return '';
  }
};
const rows = [...endpoints.values()].map((e) => ({
  ...e,
  states: [...e.states],
  phases: [...e.phases],
  dnsNames: [...(namesByIp.get(e.remote) ?? [])],
  ptr: ptr(e.remote),
}));
rows.sort((a, b) => a.firstS - b.firstS);

const wv2 = ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv`).trim();
const result = { app, browserArgs: browserArgs ?? '(app defaults)', webview2Runtime: wv2, idleS, tailS, use, marks, samples: sampleCount, maxProcesses, tcp: rows, udp: [...udp.values()] };
writeFileSync(join(out, 'egress.json'), JSON.stringify(result, null, 2));

const md = [
  `# Egress · ${new Date(startT).toISOString()}`,
  '',
  `App: \`${app}\` · WebView2 Runtime ${wv2} · browser arguments: ${browserArgs === undefined ? 'the app\'s own' : `\`${browserArgs}\``}`,
  `Phases: ${marks.map((m) => `${m.phase} @${((m.t - startT) / 1000).toFixed(0)} s`).join(' · ')} · ${String(sampleCount)} samples (~0.5 s), up to ${String(maxProcesses)} processes in the tree`,
  '',
  rows.length === 0 ? '**No TCP connection outside loopback.**' : '| First seen | Last seen | Process (type) | Remote | Names (DNS cache / PTR) | States | Phases |',
  ...(rows.length === 0 ? [] : ['| --- | --- | --- | --- | --- | --- | --- |']),
  ...rows.map((r) => `| ${r.firstS.toFixed(1)} s | ${r.lastS.toFixed(1)} s | ${r.process} (${r.type}) | ${r.remote}:${String(r.port)} | ${[...r.dnsNames, r.ptr].filter(Boolean).join(', ') || '—'} | ${r.states.join(', ')} | ${r.phases.join(', ')} |`),
  '',
  udp.size === 0 ? 'UDP: no non-loopback socket.' : `UDP sockets (local, peers not visible): ${[...udp.keys()].join('; ')}`,
  '',
];
writeFileSync(join(out, 'egress.md'), md.join('\n'));
console.log(md.join('\n'));

// --expect-none: a gate (exit 1 on any TCP connection outside loopback, or if the UI drive failed).
if (argv.includes('--expect-none')) {
  const driveFailed = marks.some((m) => m.phase.startsWith('use failed'));
  const ok = rows.length === 0 && !driveFailed && sampleCount > 0;
  console.log(ok ? 'EGRESS PASS: no connection outside loopback' : `EGRESS FAIL: ${String(rows.length)} endpoints${driveFailed ? ', UI drive failed' : ''}`);
  process.exit(ok ? 0 : 1);
}
