/**
 * Held-out adversarial sets on the phone (the Android pipeline): writes the run file pushed by
 * e2e/run-heldout.ps1, then judges the phone's heldout/device.json with the same rules as the eval and
 * desktop runs (metrics.ts: computeSetMetrics, heldoutFindings).
 *
 *   tsx src/heldoutDevice.ts --set adversarial-heldout-2 --write-run <file>
 *   tsx src/heldoutDevice.ts --set adversarial-heldout-2 --device <device.json> --out <dir>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { computeSetMetrics, heldoutFindings, type ItemOutcome } from './metrics';
import { renderHeldout } from './report';
import { loadSet } from './sets';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Each held-out set's archive (same as cli.ts HELDOUT). */
const ARCHIVES: Readonly<Record<string, string>> = {
  'adversarial-heldout': 'eval-heldout.zim',
  'adversarial-heldout-2': 'eval-heldout-2.zim',
  'adversarial-heldout-3': 'eval-heldout-3.zim',
};

interface DeviceOutcome {
  id: string;
  retrieval: ItemOutcome['retrieval'];
  noSourceReason: ItemOutcome['noSourceReason'];
  best: ItemOutcome['best'];
  sources: ItemOutcome['sources'];
  summary: ItemOutcome['summary'];
  layer1Ms: number;
}

interface DeviceReport {
  schema: number;
  engine: string;
  createdAt: string;
  set: string;
  profile: Record<string, unknown>;
  outcomes: DeviceOutcome[];
}

const argv = process.argv.slice(2);
const { values: args } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    set: { type: 'string', default: 'adversarial-heldout-2' },
    'write-run': { type: 'string' },
    device: { type: 'string' },
    out: { type: 'string' },
  },
});

async function main(): Promise<number> {
  const setName = args.set;
  const archive = ARCHIVES[setName];
  if (!archive) throw new Error(`--set must be one of ${Object.keys(ARCHIVES).join(', ')}`);
  const set = await loadSet(join(ROOT, 'sets', `${setName}.json`));

  if (args['write-run']) {
    // English-only until v1: the phone runs the English items.
    const items = set.items.filter((i) => i.lang === 'en').map((i) => ({ id: i.id, question: i.question }));
    const run = { schema: 1, set: setName, archive: `heldout/${archive}`, items };
    await writeFile(resolve(args['write-run']), `${JSON.stringify(run, null, 2)}\n`);
    console.log(`run file: ${String(items.length)} items, archive ${run.archive} -> ${args['write-run']}`);
    return 0;
  }

  if (!args.device) throw new Error('--write-run <file> or --device <device.json> is required');
  const device = JSON.parse(await readFile(resolve(args.device), 'utf8')) as DeviceReport;
  if (device.schema !== 1 || device.set !== setName) throw new Error(`${args.device}: not a ${setName} device report`);
  const byId = new Map(set.items.map((i) => [i.id, i]));
  const outcomes: ItemOutcome[] = device.outcomes.map((o) => {
    const item = byId.get(o.id);
    if (!item) throw new Error(`device report has unknown item ${o.id}`);
    return {
      set: setName,
      item,
      retrieval: o.retrieval,
      noSourceReason: o.noSourceReason,
      best: o.best,
      sources: o.sources,
      summary: o.summary,
      timing: { layer1Ms: o.layer1Ms, ttftMs: null, generateMs: null, promptTokens: null, generatedTokens: null, tokensPerSecond: null },
    };
  });
  const missing = set.items.filter((i) => i.lang === 'en' && !outcomes.some((o) => o.item.id === i.id));
  if (missing.length > 0) throw new Error(`device report misses ${missing.map((i) => i.id).join(', ')}`);
  const findings = heldoutFindings(outcomes);
  const section = renderHeldout(
    { set: setName, metrics: computeSetMetrics(outcomes), findings, items: outcomes.length, status: set.status },
    `Android (${device.engine}, ${JSON.stringify(device.profile)}, ${device.createdAt})`,
  );
  const outDir = resolve(args.out ?? join(ROOT, 'out', `heldout-device-${setName}`));
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'heldout-device.md'), `${section.join('\n')}\n`);
  await writeFile(join(outDir, 'heldout-device.json'), `${JSON.stringify({ set: setName, profile: device.profile, findings, outcomes }, null, 2)}\n`);
  console.log(section.join('\n'));
  const forbiddenShown = findings.filter((f) => f.where === 'ai').length;
  console.log(`HELD-OUT DEVICE: ${String(findings.length)} findings (${String(forbiddenShown)} in AI sentences)`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  },
);
