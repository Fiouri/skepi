// Station host for the desktop -> phone E2E (e2e/run-station.ps1), driving the real Windows build
// through tauri-driver: optionally adopt a newer signed catalog from the local test mirror first,
// then start Station mode for the selected packs on the LAN address, publish the pairing code, keep
// serving until the phone side is done, and record what the server answered.
//
//   node apps/desktop/e2e/station-host.mjs --app <exe> --content <folder> --appdata <folder>
//        --host <LAN IPv4> --packs id1,id2 --out <dir> [--update] [--add-after-update <file>]
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Driver, driverPaths, sleep, tid, waitFor } from './webdriver.mjs';

const { values: args } = parseArgs({
  options: {
    app: { type: 'string' },
    content: { type: 'string' },
    appdata: { type: 'string' },
    host: { type: 'string' },
    packs: { type: 'string' },
    out: { type: 'string' },
    update: { type: 'boolean', default: false },
    'add-after-update': { type: 'string' },
    'timeout-min': { type: 'string', default: '30' },
  },
});
for (const k of ['app', 'content', 'appdata', 'host', 'packs', 'out']) if (!args[k]) throw new Error(`--${k} is required`);
mkdirSync(args.out, { recursive: true });
const packs = args.packs.split(',');
const paths = driverPaths();
const env = { SKEPI_CONTENT_ROOT: args.content, SKEPI_APP_DATA: args.appdata };
const log = (line) => {
  console.log(`[station-host] ${line}`);
};

async function ready(d) {
  await waitFor(() => d.visible('search-screen'), 60_000, 'app start');
  // Bootstrap done: content folder reconciled, archives open (App.tsx data-status).
  await waitFor(async () => (await d.findAll('.app[data-status="ready"]')).length > 0, 600_000, 'reconcile');
  await sleep(1000);
  if (await d.visible('disclaimer')) await d.click(tid('disclaimer-accept'));
}

const driver = new Driver({ ...paths, env });
let failed = null;
try {
  if (args.update) {
    await driver.open(args.app);
    await ready(driver);
    await driver.click(tid('tab-library'));
    await driver.click(tid('check-update'));
    const msg = await waitFor(async () => ((await driver.visible('library-message')) ? driver.text(tid('library-message')) : null), 30_000, 'catalog update');
    log(`catalog update: ${msg}`);
    if (!/Catalog (updated to|\d+ is up to date)/.test(msg)) throw new Error(`catalog update failed: ${msg}`);
    await driver.close();
    if (args['add-after-update']) {
      copyFileSync(args['add-after-update'], join(args.content, 'zim', basename(args['add-after-update'])));
      log(`added ${basename(args['add-after-update'])} (registered by the next start's reconcile)`);
    }
    await sleep(2000);
  }

  await driver.open(args.app);
  await ready(driver);
  await driver.click(tid('tab-station'));
  await waitFor(() => driver.visible('station-start'), 15_000, 'station screen');
  for (const id of packs) await driver.click(tid(`station-pack-${id}`));
  const chosen = await driver.selectValue(tid('station-address'), args.host);
  if (chosen !== args.host) throw new Error(`address ${args.host} not offered (got ${String(chosen)})`);
  await driver.click(tid('station-start'));
  await waitFor(async () => (await driver.visible('station-running')) || (await driver.visible('station-error')), 30_000, 'station start');
  if (await driver.visible('station-error')) throw new Error(await driver.text(tid('station-error')));
  const code = (
    await driver.runInPage('arguments[arguments.length - 1](document.querySelector(\'[data-testid="station-code"]\').textContent)')
  ).trim();
  writeFileSync(join(args.out, 'pairing.json'), code);
  log(`serving ${packs.join(', ')} on ${args.host}; pairing code written`);
  await driver.screenshot(join(args.out, 'station-running.png'));

  const deadline = Date.now() + Number(args['timeout-min']) * 60_000;
  while (!existsSync(join(args.out, 'phone-done')) && Date.now() < deadline) await sleep(2000);
  const status = await driver.runInPage(`
    const rows = Array.from(document.querySelectorAll('[data-testid="station-log"] tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent));
    arguments[arguments.length - 1]({ status: document.querySelector('[data-testid="station-status"]')?.textContent ?? null, rows });
  `);
  writeFileSync(join(args.out, 'station-status.json'), JSON.stringify(status, null, 2));
  await driver.screenshot(join(args.out, 'station-served.png'));
  await driver.click(tid('station-stop'));
  log(`stopped; ${String(status.rows.length)} log rows`);
} catch (e) {
  failed = e;
  console.error(`[station-host] ${e.message}`);
  try {
    await driver.screenshot(join(args.out, 'station-failure.png'));
  } catch {
    // no session
  }
} finally {
  await driver.close();
  driver.kill();
}
process.exit(failed ? 1 : 0);
