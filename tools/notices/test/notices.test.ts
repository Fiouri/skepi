import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addJavaScript, licenceFiles, NoticesBuilder } from '../src/notices';

function pkg(dir: string, json: Record<string, unknown>, files: Record<string, string> = {}): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
}

describe('third-party notices', () => {
  it('finds licence and notice files and stores shared texts once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'));
    writeFileSync(join(dir, 'LICENSE-MIT'), 'MIT text');
    writeFileSync(join(dir, 'NOTICE'), 'notice');
    writeFileSync(join(dir, 'README.md'), 'not a licence');
    expect(licenceFiles(dir).map((f) => f.slice(dir.length + 1))).toEqual(['LICENSE-MIT', 'NOTICE']);
    const b = new NoticesBuilder();
    b.add({ ecosystem: 'npm', name: 'a', version: '1.0.0', license: 'MIT', url: 'u' }, [join(dir, 'LICENSE-MIT')]);
    b.add({ ecosystem: 'npm', name: 'b', version: '2.0.0', license: 'MIT', url: 'u' }, [join(dir, 'LICENSE-MIT')]);
    const out = b.build('desktop');
    expect(out.components.map((c) => c.name)).toEqual(['a', 'b']);
    expect(Object.keys(out.texts)).toHaveLength(1);
  });

  it('follows run-time dependencies like Node, never dev dependencies, workspace packages or platform binaries', () => {
    const root = mkdtempSync(join(tmpdir(), 'notices-app-'));
    const app = join(root, 'apps', 'demo');
    pkg(app, { name: 'demo', dependencies: { left: '1', '@ws/lib': '1' }, devDependencies: { tooling: '1' } });
    pkg(join(root, 'node_modules', 'left'), { name: 'left', version: '1.2.3', license: 'MIT', dependencies: { deep: '1' }, optionalDependencies: { native: '1' } }, { LICENSE: 'left licence' });
    pkg(join(root, 'node_modules', 'deep'), { name: 'deep', version: '4.0.0', license: { type: 'ISC' } });
    pkg(join(root, 'node_modules', 'native'), { name: 'native', version: '1.0.0', license: 'MIT', os: ['win32'] });
    pkg(join(root, 'node_modules', 'tooling'), { name: 'tooling', version: '9.9.9', license: 'MIT' });
    // A workspace package is linked into node_modules (pnpm): followed, never listed.
    pkg(join(root, 'packages', 'lib'), { name: '@ws/lib', version: '0.0.0', dependencies: { deep: '1' } });
    mkdirSync(join(app, 'node_modules', '@ws'), { recursive: true });
    symlinkSync(join(root, 'packages', 'lib'), join(app, 'node_modules', '@ws', 'lib'), 'junction');

    const b = new NoticesBuilder();
    addJavaScript(b, app);
    const out = b.build('mobile');
    expect(out.components.map((c) => `${c.name}@${c.version} ${c.license}`)).toEqual(['deep@4.0.0 ISC', 'left@1.2.3 MIT']);
    expect(out.components.find((c) => c.name === 'left')?.texts).toHaveLength(1);
  });
});
