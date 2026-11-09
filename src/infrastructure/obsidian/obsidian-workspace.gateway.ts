import { App, TFile } from "obsidian";
import type { WorkspaceGateway } from "../../domain/interfaces/ports";

export class ObsidianWorkspaceGateway implements WorkspaceGateway {
  constructor(private readonly app: App) {}

  async openNote(path: string, options?: { newTab?: boolean }): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(options?.newTab ? "tab" : false).openFile(file);
  }
}
