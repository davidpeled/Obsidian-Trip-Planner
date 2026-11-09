import type { App } from "obsidian";
import { parseFrontmatter } from "../infrastructure/in-memory/frontmatter";
import { TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "./obsidian.stub";

type Handler = (...args: never[]) => unknown;

/** An Obsidian event source: `on` subscribes, and tests `emit` to fire it. */
class FakeEvents {
  private readonly handlers = new Map<string, Handler[]>();
  on = (name: string, handler: Handler) => {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
    return { name, handler };
  };
  emit(name: string, ...args: unknown[]): void {
    (this.handlers.get(name) ?? []).forEach((h) => void (h as (...a: unknown[]) => unknown)(...args));
  }
  count(name: string): number {
    return this.handlers.get(name)?.length ?? 0;
  }
}

/**
 * The slice of Obsidian's `App` the vault adapter uses, over an in-memory tree, with Obsidian's behavior:
 * the root folder is "/", `create` and `createFolder` throw when the path exists, and files need their folder.
 */
export class FakeObsidianApp {
  private readonly root = new TFolder("/");
  private readonly entries = new Map<string, TAbstractFile>();

  readonly vaultEvents = new FakeEvents();
  readonly metadataEvents = new FakeEvents();
  readonly workspaceEvents = new FakeEvents();

  /** Leaves handed out by the workspace, and what was asked of it. */
  readonly leaves: WorkspaceLeaf[] = [];
  readonly leafRequests: unknown[] = [];
  readonly revealed: WorkspaceLeaf[] = [];

  readonly workspace = {
    on: this.workspaceEvents.on,
    getLeavesOfType: (type: string): WorkspaceLeaf[] => this.leaves.filter((l) => l.viewState?.type === type),
    getLeaf: (request: "tab" | false): WorkspaceLeaf => {
      this.leafRequests.push(request);
      const leaf = new WorkspaceLeaf(this.asApp());
      this.leaves.push(leaf);
      return leaf;
    },
    revealLeaf: (leaf: WorkspaceLeaf): Promise<void> => {
      this.revealed.push(leaf);
      return Promise.resolve();
    },
  };

  readonly vault = {
    on: this.vaultEvents.on,
    /** Like Obsidian's, includes the root ("/") unless told not to. */
    getAllFolders: (includeRoot = true): TFolder[] => [...(includeRoot ? [this.root] : []), ...[...this.entries.values()].filter((e): e is TFolder => e instanceof TFolder)],
    getMarkdownFiles: (): TFile[] => [...this.entries.values()].filter((e): e is TFile => e instanceof TFile && e.path.endsWith(".md")),
    /** Every file and folder, root first, as Obsidian's does. */
    getAllLoadedFiles: (): TAbstractFile[] => [this.root, ...this.entries.values()],
    getAbstractFileByPath: (path: string): TAbstractFile | null => this.entries.get(path) ?? null,
    getFolderByPath: (path: string): TFolder | null => {
      if (path === "/") return this.root;
      const e = this.entries.get(path);
      return e instanceof TFolder ? e : null;
    },
    createFolder: (path: string): Promise<TFolder> => {
      if (this.entries.has(path)) return Promise.reject(new Error("Folder already exists."));
      return Promise.resolve(this.add(new TFolder(path)));
    },
    create: (path: string, content: string): Promise<TFile> => {
      if (this.entries.has(path)) return Promise.reject(new Error("File already exists."));
      const file = new TFile(path);
      file.content = content;
      return Promise.resolve(this.add(file));
    },
  };

  readonly metadataCache = {
    on: this.metadataEvents.on,
    getFileCache: (file: TFile) => ({ frontmatter: parseFrontmatter(file.content) ?? undefined }),
  };

  readonly fileManager = {
    trashFile: (file: TAbstractFile): Promise<void> => {
      const doomed = [...this.entries.keys()].filter((p) => p === file.path || p.startsWith(`${file.path}/`));
      doomed.sort((a, b) => b.length - a.length).forEach((p) => this.remove(p)); // children before their folder
      return Promise.resolve();
    },
  };

  /** Test helper: a note, with whatever parent folders it needs. */
  addNote(path: string, content: string): void {
    const parts = path.split("/");
    parts.slice(0, -1).forEach((_, i) => {
      const folder = parts.slice(0, i + 1).join("/");
      if (!this.entries.has(folder)) this.add(new TFolder(folder));
    });
    const file = new TFile(path);
    file.content = content;
    this.add(file);
  }

  filePaths(): string[] {
    return [...this.entries.values()].filter((e) => e instanceof TFile).map((e) => e.path).sort();
  }

  folderPaths(): string[] {
    return [...this.entries.values()].filter((e) => e instanceof TFolder).map((e) => e.path).sort();
  }

  asApp(): App {
    return this as unknown as App;
  }

  private parentOf(path: string): TFolder {
    const at = path.lastIndexOf("/");
    const parent = at < 0 ? this.root : this.entries.get(path.slice(0, at));
    if (!(parent instanceof TFolder)) throw new Error(`No folder for ${path}`);
    return parent;
  }

  private add<T extends TAbstractFile>(entry: T): T {
    this.parentOf(entry.path).children.push(entry);
    this.entries.set(entry.path, entry);
    return entry;
  }

  private remove(path: string): void {
    const entry = this.entries.get(path);
    if (!entry) return;
    const parent = this.parentOf(path);
    parent.children = parent.children.filter((c) => c !== entry);
    this.entries.delete(path);
  }
}
