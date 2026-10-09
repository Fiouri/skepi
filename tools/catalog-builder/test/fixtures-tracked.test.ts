import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFixtures } from '../src/fixtures';
import { REPO_ROOT } from '../src/keys';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

/** A throw-away repository with one mirror test catalog, its fixture and a test that names it. */
function sandbox(content: Buffer) {
  const root = mkdtempSync(join(tmpdir(), 'skepi-fixtures-'));
  git(root, 'init', '-q');
  mkdirSync(join(root, 'e2e', 'mirror', 'catalogs', 'good'), { recursive: true });
  mkdirSync(join(root, 'e2e', 'fixtures'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });
  const catalog = {
    packs: [
      {
        id: 'test-pack',
        file: 'pack.zim',
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        urls: ['https://127.0.0.1:8443/packs/pack.zim'],
      },
    ],
  };
  writeFileSync(join(root, 'e2e', 'mirror', 'catalogs', 'good', 'catalog.json'), JSON.stringify(catalog));
  writeFileSync(join(root, 'e2e', 'fixtures', 'pack.zim'), content);
  writeFileSync(join(root, 'tests', 'pack.rs'), 'let p = repo("e2e/fixtures/pack.zim");\nlet bad = fixtures().join("../fixtures/../x.json");\n');
  git(root, 'add', 'e2e/mirror', 'tests');
  return root;
}

describe('test fixtures are committed', () => {
  it('holds for this repository', () => {
    expect(checkFixtures(REPO_ROOT)).toEqual([]);
  });

  it('reports a fixture that exists only in the working tree (the Phase 3a CI failure)', () => {
    const root = sandbox(Buffer.from('fixture bytes'));
    const problems = checkFixtures(root);
    expect(problems.map((p) => `${p.from}: ${p.problem}`)).toEqual([
      'e2e/mirror/catalogs/good/catalog.json: pack test-pack: not committed in e2e/fixtures or tools/rag-eval/fixtures',
      'tests/pack.rs: referenced but not committed',
      'working tree: file in a fixtures directory is not committed',
    ]);
  });

  it('passes once committed, and catches bytes that no longer match the signed catalog', () => {
    const root = sandbox(Buffer.from('fixture bytes'));
    git(root, 'add', 'e2e/fixtures/pack.zim');
    expect(checkFixtures(root)).toEqual([]);
    writeFileSync(join(root, 'e2e', 'fixtures', 'pack.zim'), Buffer.from('fixture BYTES'));
    expect(checkFixtures(root).map((p) => p.problem)).toEqual(['pack test-pack: SHA-256 differs from the catalog']);
  });
});
