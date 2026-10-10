/**
 * Third-party notices for the About screens (Developer Preview): every component an app ships, with its
 * licence and the licence/notice files found in the package, generated from
 * - JavaScript: the app's run-time dependency tree, resolved like Node does (src/notices.ts addJavaScript);
 * - Rust (desktop): `cargo metadata` for Windows, the crates the Tauri app links at run time;
 * - Android (mobile): app/build/skepi/android-dependencies.json from the Gradle task
 *   `skepiAndroidDependencies` (apps/mobile/plugins/withThirdPartyNotices.js), licences from the POMs;
 * - native libraries not visible in package metadata (src/native.ts).
 * Output is deterministic (sorted, no timestamps) so CI can check that the committed files are current.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

export type Ecosystem = 'npm' | 'cargo' | 'maven' | 'native';

export interface Component {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** SPDX expression or the licence names given by the package. */
  license: string;
  url: string;
  /** Ids of licence / notice texts in `NoticesFile.texts`. */
  texts: string[];
}

export interface NoticesFile {
  schema: 1;
  app: 'mobile' | 'desktop';
  components: Component[];
  /** Licence and notice file contents by SHA-256 prefix (shared texts are stored once). */
  texts: Record<string, string>;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicen[cs]e)([-._].*)?$/i;
/** Licence texts are kept whole but bounded: a few packages ship very long notice files. */
const MAX_TEXT = 64 * 1024;

function textId(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Licence and notice files at the top of a package folder, sorted by name. */
export function licenceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENSE_FILE.test(e.name))
    .map((e) => join(dir, e.name))
    .sort();
}

export class NoticesBuilder {
  private readonly components = new Map<string, Component>();
  private readonly texts = new Map<string, string>();

  addText(text: string): string {
    const normalised = text.replace(/\r\n?/g, '\n').trim();
    const bounded = normalised.length > MAX_TEXT ? `${normalised.slice(0, MAX_TEXT)}\n[…]` : normalised;
    const id = textId(bounded);
    this.texts.set(id, bounded);
    return id;
  }

  add(c: Omit<Component, 'texts'>, files: readonly string[] = [], extraTexts: readonly string[] = []): void {
    const key = `${c.ecosystem}:${c.name}@${c.version}`;
    if (this.components.has(key)) return;
    const texts = [...files.map((f) => readFileSync(f, 'utf8')), ...extraTexts].filter((t) => t.trim().length > 0).map((t) => this.addText(t));
    this.components.set(key, { ...c, texts: [...new Set(texts)] });
  }

  build(app: NoticesFile['app']): NoticesFile {
    const components = [...this.components.values()].sort(
      (a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    );
    const used = new Set(components.flatMap((c) => c.texts));
    const texts = Object.fromEntries([...this.texts.entries()].filter(([id]) => used.has(id)).sort(([a], [b]) => a.localeCompare(b)));
    return { schema: 1, app, components, texts };
  }
}

interface PackageJson {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  homepage?: string;
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  os?: string[];
  cpu?: string[];
}

/** The folder of package `name` as Node would resolve it from `from` (node_modules up the tree). */
function findPackage(name: string, from: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', ...name.split('/'));
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function licenceOf(p: PackageJson): string {
  if (typeof p.license === 'string') return p.license;
  if (p.license?.type) return p.license.type;
  const types = (p.licenses ?? []).map((l) => l.type).filter((t): t is string => Boolean(t));
  return types.length > 0 ? types.join(' OR ') : 'not declared';
}

function urlOf(p: PackageJson, name: string): string {
  const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url;
  return p.homepage ?? repo?.replace(/^git\+/, '') ?? `https://www.npmjs.com/package/${name}`;
}

/**
 * JavaScript packages an app depends on at run time: its `dependencies`, followed through
 * `dependencies` and `optionalDependencies` (never devDependencies), resolved like Node does.
 * Workspace packages (@skepi/*, the local Expo modules) are followed but not listed.
 */
export function addJavaScript(b: NoticesBuilder, appDir: string): void {
  const seen = new Set<string>();
  const queue: { name: string; from: string }[] = [];
  const enqueue = (p: PackageJson, from: string): void => {
    for (const name of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) queue.push({ name, from });
  };
  enqueue(JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as PackageJson, appDir);
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const dir = findPackage(next.name, next.from);
    if (dir === null || seen.has(dir)) continue;
    seen.add(dir);
    const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
    // Platform-specific binaries (`os` / `cpu`) are build tools' prebuilt executables; they differ per
    // machine and are not part of an app bundle.
    if (p.os || p.cpu) continue;
    enqueue(p, dir);
    const workspace = !dir.includes(`${sep}node_modules${sep}`);
    if (workspace) continue;
    const name = p.name ?? next.name;
    b.add({ ecosystem: 'npm', name, version: p.version ?? '?', license: licenceOf(p), url: urlOf(p, name) }, licenceFiles(dir));
  }
}

interface CargoPackage {
  id: string;
  name: string;
  version: string;
  license: string | null;
  license_file: string | null;
  repository: string | null;
  manifest_path: string;
}

interface CargoMetadata {
  packages: CargoPackage[];
  workspace_members: string[];
  resolve: { nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
}

/** Rust crates the given workspace crate links at run time on Windows (normal dependencies only). */
export function addRust(b: NoticesBuilder, repo: string, rootCrate: string): void {
  const out = execFileSync('cargo', ['metadata', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const m = JSON.parse(out) as CargoMetadata;
  const workspace = new Set(m.workspace_members);
  const nodes = new Map(m.resolve.nodes.map((n) => [n.id, n]));
  const root = m.packages.find((p) => p.name === rootCrate);
  if (!root) throw new Error(`crate ${rootCrate} not found`);
  const seen = new Set([root.id]);
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.pop() ?? '';
    for (const d of nodes.get(id)?.deps ?? []) {
      if (!d.dep_kinds.some((k) => k.kind === null) || seen.has(d.pkg)) continue;
      seen.add(d.pkg);
      queue.push(d.pkg);
    }
  }
  for (const p of m.packages) {
    if (!seen.has(p.id) || workspace.has(p.id)) continue;
    const dir = dirname(p.manifest_path);
    const files = new Set(licenceFiles(dir));
    if (p.license_file) files.add(join(dir, p.license_file));
    b.add(
      { ecosystem: 'cargo', name: p.name, version: p.version, license: p.license ?? 'see licence file', url: p.repository ?? `https://crates.io/crates/${p.name}` },
      [...files].filter((f) => existsSync(f)).sort(),
    );
  }
}

interface AndroidRow {
  group: string;
  name: string;
  version: string;
  url: string;
  licenses: { name: string; url: string }[];
}

/** Modules whose POM declares no licence: the licence of the project they are published from. */
const POM_LICENCE_GAPS: Readonly<Record<string, string>> = {
  'com.facebook.react:react-android': 'MIT (React Native)',
  'com.facebook.hermes:hermes-android': 'MIT (Hermes)',
};

/** Maven modules of the Android release runtime classpath (Gradle task skepiAndroidDependencies). */
export function addAndroid(b: NoticesBuilder, rows: readonly AndroidRow[]): void {
  for (const r of rows) {
    const license = r.licenses.length > 0 ? r.licenses.map((l) => l.name).join(' / ') : (POM_LICENCE_GAPS[`${r.group}:${r.name}`] ?? 'not declared in the POM');
    const urls = r.licenses.map((l) => `${l.name}: ${l.url}`).join('\n');
    b.add(
      { ecosystem: 'maven', name: `${r.group}:${r.name}`, version: r.version, license, url: r.url || `https://search.maven.org/artifact/${r.group}/${r.name}/${r.version}/` },
      [],
      urls ? [urls] : [],
    );
  }
}
