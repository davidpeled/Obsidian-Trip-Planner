import { AbstractInputSuggest, App, TFolder } from "obsidian";

/** Suggests the vault's folders as you type into a text field. */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    private readonly input: HTMLInputElement,
    private readonly onPick: (path: string) => void
  ) {
    super(app, input);
  }

  protected getSuggestions(query: string): TFolder[] {
    const q = query.trim().toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((f) => f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path;
    this.onPick(folder.path);
    this.close();
  }
}
