import type { TripPlan, VaultNote } from "../../domain/contracts/trip";
import type { TripVaultRepository } from "../../domain/interfaces/ports";
import { parseFrontmatter } from "./frontmatter";

const ancestors = (path: string): string[] =>
  path
    .split("/")
    .slice(0, -1)
    .map((_, i, all) => all.slice(0, i + 1).join("/"));

/** A vault held in memory; the twin of the Obsidian adapter for tests, including its failure behavior. */
export class InMemoryTripVaultRepository implements TripVaultRepository {
  private readonly folders = new Set<string>();
  private readonly files = new Map<string, string>();

  /** Test helper: put a note straight into the vault (its parent folders come with it, as in a real vault). */
  addNote(path: string, content: string): void {
    this.files.set(path, content);
    ancestors(path).forEach((f) => this.folders.add(f));
  }

  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  folderPaths(): string[] {
    return [...this.folders].sort();
  }

  listTypedNotes(types: readonly string[]): Promise<VaultNote[]> {
    return Promise.resolve(
      [...this.files]
        .map(([path, content]) => ({ path, frontmatter: parseFrontmatter(content) }))
        .filter((n) => typeof n.frontmatter?.type === "string" && types.includes(n.frontmatter.type))
    );
  }

  exists(path: string): Promise<boolean> {
    const wanted = path.toLowerCase();
    return Promise.resolve([...this.folders, ...this.files.keys()].some((p) => p.toLowerCase() === wanted));
  }

  write(plan: TripPlan): Promise<void> {
    const madeFolders: string[] = [];
    const madeFiles: string[] = [];
    try {
      for (const folder of plan.folders) {
        if (this.folders.has(folder)) continue;
        this.folders.add(folder);
        madeFolders.push(folder);
      }
      for (const note of plan.notes) {
        if (this.files.has(note.path)) throw new Error(`File already exists: ${note.path}`);
        this.files.set(note.path, note.content);
        madeFiles.push(note.path);
      }
      return Promise.resolve();
    } catch (e) {
      madeFiles.forEach((p) => this.files.delete(p));
      madeFolders.forEach((f) => this.folders.delete(f));
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  countFiles(folder: string): Promise<number> {
    return Promise.resolve([...this.files.keys()].filter((p) => p.startsWith(`${folder}/`)).length);
  }

  trash(folder: string): Promise<void> {
    if (!folder.replace(/\//g, "").trim()) return Promise.reject(new Error("Refusing to delete the vault root."));
    for (const path of [...this.files.keys()]) if (path.startsWith(`${folder}/`)) this.files.delete(path);
    for (const f of [...this.folders]) if (f === folder || f.startsWith(`${folder}/`)) this.folders.delete(f);
    return Promise.resolve();
  }
}
