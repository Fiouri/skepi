// The only network use of this tool: one download of the pinned IFRC PDF (never committed; cached in
// --cache-dir, CI caches it by its SHA-256). The file is accepted only with the pinned hash.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The PDF from the cache, downloaded first when missing or different from the pinned hash. */
export async function fetchPinned(url: string, expectedSha256: string, cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${expectedSha256}.pdf`);
  if (existsSync(file) && sha256(readFileSync(file)) === expectedSha256) return file;
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'SKEPI cards-source-check' } });
  if (!response.ok) throw new Error(`download failed: HTTP ${String(response.status)} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const got = sha256(bytes);
  if (got !== expectedSha256) throw new Error(`SHA-256 mismatch for ${url}: expected ${expectedSha256}, got ${got} (the IFRC replaced the file? Pin the new edition deliberately.)`);
  const partial = `${file}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, file);
  return file;
}

/** The pdftotext binary: SKEPI_PDFTOTEXT, else `pdftotext` on PATH (Poppler or Xpdf). */
export function pdftotextBinary(): string {
  return process.env.SKEPI_PDFTOTEXT ?? 'pdftotext';
}

export function pdftotextVersion(bin: string = pdftotextBinary()): string {
  const r = spawnSync(bin, ['-v'], { encoding: 'utf8' });
  if (r.error) throw new Error(`pdftotext not found (${bin}): install poppler-utils, or set SKEPI_PDFTOTEXT`);
  return `${r.stdout}${r.stderr}`.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? 'unknown';
}

/** The PDF's text, one form feed per page (`pdftotext -enc UTF-8 <pdf> -`). */
export function extractText(pdf: string, bin: string = pdftotextBinary()): string {
  const r = spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`pdftotext failed (${String(r.status)}): ${r.stderr.toString('utf8')}`);
  return r.stdout.toString('utf8');
}
