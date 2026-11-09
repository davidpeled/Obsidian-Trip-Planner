import { App, TAbstractFile, TFile, Vault, normalizePath } from "obsidian";
import type { TripPlan, VaultNote } from "../../domain/contracts/trip";
import type { TripVaultRepository } from "../../domain/interfaces/ports";

/** Trips as notes and folders in the vault; frontmatter comes from Obsidian's metadata cache. */
export class ObsidianTripVaultRepository implements TripVaultRepository {
  constructor(private readonly app: App) {}

  listTypedNotes(types: readonly string[]): Promise<VaultNote[]> {
    const notes = this.app.vault
      .getMarkdownFiles()
      .map((f) => ({ path: f.path, frontmatter: this.app.metadataCache.getFileCache(f)?.frontmatter ?? null }))
      .filter((n) => typeof n.frontmatter?.type === "string" && types.includes(n.frontmatter.type));
    return Promise.resolve(notes);
  }

  exists(path: string): Promise<boolean> {
    const wanted = normalizePath(path).toLowerCase();
    return Promise.resolve(this.app.vault.getAllLoadedFiles().some((f) => f.path.toLowerCase() === wanted));
  }

  async write(plan: TripPlan): Promise<void> {
    const made: string[] = []; // folders and files this call created, in order
    try {
      for (const folder of plan.folders) await this.ensureFolder(folder, made);
      for (const note of plan.notes) {
        const path = normalizePath(note.path);
        await this.app.vault.create(path, note.content); // throws if the file already exists
        made.push(path);
      }
    } catch (e) {
      await this.removeAll(made);
      throw e;
    }
  }

  countFiles(folder: string): Promise<number> {
    const root = this.app.vault.getFolderByPath(normalizePath(folder));
    let count = 0;
    if (root) Vault.recurseChildren(root, (f) => f instanceof TFile && count++);
    return Promise.resolve(count);
  }

  /** Honors the user's "Deleted files" setting (system trash, vault .trash, or permanent). Never the vault root. */
  async trash(folder: string): Promise<void> {
    const path = normalizePath(folder.trim());
    if (path === "/" || path === "") throw new Error("Refusing to delete the vault root.");
    const target = this.app.vault.getFolderByPath(path);
    if (target) await this.app.fileManager.trashFile(target);
  }

  /** Creates the folder and any missing parents, noting each one that didn't exist before. */
  private async ensureFolder(path: string, made: string[]): Promise<void> {
    let current = "";
    for (const part of normalizePath(path).split("/")) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getFolderByPath(current)) continue;
      await this.app.vault.createFolder(current);
      made.push(current);
    }
  }

  /** Best effort, newest first (files before the folders that hold them). Removed the way the user's "Deleted files" setting says (Obsidian's plugin rules require it). */
  private async removeAll(made: string[]): Promise<void> {
    for (const path of [...made].reverse()) {
      try {
        const file: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);
        if (file) await this.app.fileManager.trashFile(file);
      } catch {
        // Leave what can't be removed; the original error is what matters.
      }
    }
  }
}
