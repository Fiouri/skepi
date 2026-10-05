import { probeRetrieval, type ParityQueryFile, type ParityRecord, type ParityReport } from '@skepi/core';
import { ExpoZim } from 'expo-zim';
import { knowledge, ragArchives, useContent } from './content';

/** Written by tools/rag-eval (`parity --write-queries`) and pushed by e2e/run-parity.ps1. */
export const PARITY_QUERIES = 'parity/queries.json';
export const PARITY_OUTPUT = 'parity/device.json';

function parseQueryFile(text: string): ParityQueryFile {
  const data = JSON.parse(text) as Partial<ParityQueryFile>;
  if (data.schema !== 1 || !data.config || !Array.isArray(data.queries)) throw new Error(`${PARITY_QUERIES}: unexpected format`);
  return data as ParityQueryFile;
}

/**
 * Retrieval-only parity run (no LLM): every query goes through the same `retrieve()` the Ask screen
 * uses, recorded step by step; tools/rag-eval runs the same list through python-libzim and compares.
 */
export async function runParity(log: (line: string) => void): Promise<ParityReport> {
  const raw = await ExpoZim.readContentFile(PARITY_QUERIES);
  if (raw === null) throw new Error(`${PARITY_QUERIES} not found (push it with e2e/run-parity.ps1)`);
  const input = parseQueryFile(raw);
  const { archives } = useContent.getState();
  if (archives.length === 0) throw new Error('No ZIM archive open');
  const names = new Map(archives.map((a) => [a.archiveId, a.name]));
  const records: ParityRecord[] = [];
  for (const [i, q] of input.queries.entries()) {
    records.push(await probeRetrieval(q, knowledge, names, { config: input.config, archives: ragArchives() }));
    if ((i + 1) % 20 === 0) log(`parity ${i + 1}/${input.queries.length}`);
  }
  const report: ParityReport = {
    schema: 1,
    engine: 'android',
    createdAt: new Date().toISOString(),
    config: input.config,
    archives: archives.map((a) => ({ archiveId: a.archiveId, name: a.name, language: a.language, articleCount: a.articleCount })),
    records,
  };
  const path = await ExpoZim.writeContentFile(PARITY_OUTPUT, JSON.stringify(report));
  log(`parity: ${records.length} queries written to ${path}`);
  return report;
}
