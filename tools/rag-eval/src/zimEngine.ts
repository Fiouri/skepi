import type { Article, ArchiveInfo, ArticleText, KnowledgeEngine, PackFile, SearchHit, SearchOptions } from '@skepi/contracts';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SIDECAR = fileURLToPath(new URL('../zim_sidecar.py', import.meta.url));

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface SidecarArchive {
  archiveId: string;
  name: string;
  title: string;
  language: string;
  articleCount: number;
  hasFulltextIndex: boolean;
  sizeBytes: number;
}

/**
 * KnowledgeEngine over python-libzim (zim_sidecar.py): the same libzim/Xapian engine and the same
 * search and text-extraction rules as the Android module, so retrieval matches the phone.
 */
export class SidecarZimEngine implements KnowledgeEngine {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private stderr = '';

  /**
   * `python` runs zim_sidecar.py with that interpreter; `{ command }` runs another engine speaking the
   * same protocol (the desktop's Rust sidecar, crates/desktop-core/src/bin/zim-sidecar.rs).
   */
  constructor(engine: string | { command: string; args?: string[] }) {
    const [command, argv] = typeof engine === 'string' ? [engine, [SIDECAR]] : [engine.command, engine.args ?? []];
    this.child = spawn(command, argv, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
    });
    this.child.on('exit', (code) => {
      const error = new Error(`zim sidecar exited (${String(code)}): ${this.stderr.trim()}`);
      for (const p of this.pending.values()) p.reject(error);
      this.pending.clear();
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let msg: { id?: number; ok?: boolean; result?: unknown; error?: string };
      try {
        msg = JSON.parse(line) as typeof msg;
      } catch {
        return;
      }
      if (typeof msg.id !== 'number') return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error ?? 'sidecar error'));
    });
  }

  private call<T>(op: string, args: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => { resolve(v as T); }, reject });
      this.child.stdin.write(`${JSON.stringify({ id, op, ...args })}\n`);
    });
  }

  open(path: string): Promise<SidecarArchive> {
    return this.call<SidecarArchive>('open', { path });
  }

  async openArchive(file: PackFile): Promise<ArchiveInfo> {
    const a = await this.open(file.path);
    return {
      archiveId: a.archiveId,
      packId: file.packId,
      title: a.title,
      language: a.language,
      articleCount: a.articleCount,
      hasFulltextIndex: a.hasFulltextIndex,
      hasTitleIndex: true,
      mainPath: null,
    };
  }

  search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    return this.call<SearchHit[]>(opts.mode === 'suggest' ? 'suggest' : 'search', {
      query,
      limit: opts.limit,
      archiveIds: opts.archiveIds ? [...opts.archiveIds] : null,
    });
  }

  getArticle(archiveId: string, path: string): Promise<Article> {
    return this.call<Article>('html', { archiveId, path });
  }

  getPlainText(archiveId: string, path: string): Promise<ArticleText> {
    return this.call<ArticleText>('plainText', { archiveId, path });
  }

  exists(archiveId: string, path: string): Promise<{ path: string; title: string } | null> {
    return this.call<{ path: string; title: string } | null>('exists', { archiveId, path });
  }

  closeArchive(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.child.stdin.end();
  }
}
