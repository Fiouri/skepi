import {
  compareParity,
  probeRetrieval,
  type ParityDiff,
  type ParityQueryFile,
  type ParityRecord,
  type ParityReport,
  type ParityStep,
} from '@skepi/core';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCacheDir } from '@skepi/catalog-builder/paths';
import { parseArgs } from 'node:util';
import { loadSet } from './sets';
import { SidecarZimEngine } from './zimEngine';

/**
 * Device/eval retrieval parity (no LLM).
 *   --write-queries <file>  query list from the en golden set (+ el with --greek; frozen locale, manual)
 *   --device <file>         the phone's parity/device.json: rerun the same list here and compare
 * Exit 1 on any difference; the report names the first pipeline step where each question diverges.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(ROOT, '..', '..');
interface Lock {
  zim: Record<string, { file: string }>;
  zimDefault: string[];
  zimLocale: string[];
  model: { file: string };
}

const argv = process.argv.slice(2);
const { values: args } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    'write-queries': { type: 'string' },
    device: { type: 'string' },
    zim: { type: 'string', multiple: true },
    python: { type: 'string' },
    out: { type: 'string' },
    // English-only until v1: the Greek questions (and the Greek pack) only on request.
    greek: { type: 'boolean', default: false },
  },
});

const PARITY_SETS = args.greek ? (['en', 'el'] as const) : (['en'] as const);

function cacheDir(): string {
  return resolveCacheDir();
}

async function queryFile(lock: Lock): Promise<ParityQueryFile> {
  const queries = [];
  for (const name of PARITY_SETS) {
    const set = await loadSet(join(ROOT, 'sets', `${name}.json`));
    queries.push(...set.items.map((i) => ({ id: i.id, question: i.question })));
  }
  // T2 budget with the default mobile model: the profile of the S23 in normal mode.
  return { schema: 1, config: { tier: 'T2', modelId: lock.model.file, contextSize: 2048 }, queries };
}

function renderMarkdown(device: ParityReport, evalRun: ParityReport, diffs: readonly ParityDiff[]): string {
  const steps = new Map<ParityStep, number>();
  for (const d of diffs) steps.set(d.step, (steps.get(d.step) ?? 0) + 1);
  const lines = [
    `# Retrieval parity · ${evalRun.createdAt}`,
    '',
    `Device: ${device.engine} (${device.createdAt}) · eval: ${evalRun.engine} · config ${JSON.stringify(evalRun.config)}`,
    '',
    `Archives (device): ${device.archives.map((a) => `${a.name} (${a.language}, ${a.articleCount})`).join(', ')}`,
    `Archives (eval): ${evalRun.archives.map((a) => `${a.name} (${a.language}, ${a.articleCount})`).join(', ')}`,
    '',
    `Queries: ${evalRun.records.length} · identical: ${evalRun.records.length - new Set(diffs.map((d) => d.id)).size} · different: ${new Set(diffs.map((d) => d.id)).size}`,
    '',
  ];
  if (diffs.length > 0) {
    lines.push(`First diverging step: ${[...steps].map(([s, n]) => `${s} ${n}`).join(', ')}`, '');
    lines.push('| Id | Question | Step | Detail (device vs eval) |', '| --- | --- | --- | --- |');
    for (const d of diffs) lines.push(`| ${d.id} | ${d.question} | ${d.step} | ${d.detail.replace(/\|/g, '\\|').slice(0, 600)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<number> {
  const lock = JSON.parse(await readFile(join(REPO, 'scripts', 'content.lock.json'), 'utf8')) as Lock;
  const writeTo = args['write-queries'];
  if (writeTo) {
    const file = await queryFile(lock);
    await mkdir(dirname(resolve(writeTo)), { recursive: true });
    await writeFile(writeTo, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`${file.queries.length} parity queries written to ${writeTo}`);
    return 0;
  }
  const devicePath = args.device;
  if (!devicePath) throw new Error('use --write-queries <file> or --device <device.json>');
  const device = JSON.parse(await readFile(devicePath, 'utf8')) as ParityReport;
  const zims = args.zim ?? [...lock.zimDefault, ...(args.greek ? lock.zimLocale : [])].map((id) => join(cacheDir(), lock.zim[id]?.file ?? id));
  for (const z of zims) if (!existsSync(z)) throw new Error(`missing ${z} (scripts/provision.ps1 -DownloadOnly)`);

  const knowledge = new SidecarZimEngine(args.python ?? process.env.SKEPI_PYTHON ?? 'python');
  try {
    const archives = [];
    for (const z of zims) archives.push(await knowledge.open(z));
    const names = new Map(archives.map((a) => [a.archiveId, a.name]));
    const refs = archives.map((a) => ({ archiveId: a.archiveId, language: a.language }));
    const records: ParityRecord[] = [];
    for (const q of device.records) {
      records.push(await probeRetrieval({ id: q.id, question: q.question }, knowledge, names, { config: device.config, archives: refs }));
    }
    const evalRun: ParityReport = {
      schema: 1,
      engine: 'rag-eval (python-libzim)',
      createdAt: new Date().toISOString(),
      config: device.config,
      archives: archives.map((a) => ({ archiveId: a.archiveId, name: a.name, language: a.language, articleCount: a.articleCount })),
      records,
    };
    const diffs = compareParity(device, evalRun);
    const outDir = args.out ? resolve(args.out) : join(ROOT, 'out');
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'parity-eval.json'), JSON.stringify(evalRun));
    await writeFile(join(outDir, 'parity-diffs.json'), `${JSON.stringify(diffs, null, 2)}\n`);
    const md = renderMarkdown(device, evalRun, diffs);
    await writeFile(join(outDir, 'parity.md'), md);
    console.log(md.split('\n').slice(0, 12).join('\n'));
    if (diffs.length > 0) {
      console.error(`PARITY FAILED: ${new Set(diffs.map((d) => d.id)).size} of ${records.length} queries differ (see ${join(outDir, 'parity.md')})`);
      return 1;
    }
    console.log(`PARITY PASS: ${records.length} queries identical`);
    return 0;
  } finally {
    knowledge.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exitCode = 2;
  },
);
