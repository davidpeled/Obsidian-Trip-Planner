import { App, Modal, Setting } from "obsidian";

function inside(fileCount: number): string {
  if (fileCount === 0) return "The folder has no files in it.";
  const files = fileCount === 1 ? "The 1 file" : `All ${fileCount} files`;
  return `${files} inside it will be deleted, including anything you added yourself: notes, tickets, PDFs and documents.`;
}

/** Asks before a trip's folder is moved to the trash. Cancel has the focus, so Enter never deletes by accident. */
export class ConfirmDeleteModal extends Modal {
  constructor(
    app: App,
    private readonly trip: { name: string; folder: string; fileCount: number },
    private readonly onConfirm: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, trip } = this;
    this.setTitle(`Delete ${trip.name}?`);

    // Say plainly what goes: the whole folder, not just the notes this plugin made.
    const warning = contentEl.createDiv({ cls: "trip-planner-warning", attr: { role: "alert" } });
    warning.createEl("strong", { text: `Warning: this will delete everything under ${trip.folder}` });
    warning.createEl("p", { text: inside(trip.fileCount) });
    contentEl.createEl("p", { cls: "setting-item-description", text: 'It is moved to the trash, following the "Deleted files" setting in Obsidian.' });

    new Setting(contentEl)
      .addButton((b) => {
        b.setButtonText("Cancel").onClick(() => this.close());
        window.setTimeout(() => b.buttonEl.focus());
      })
      .addButton((b) => {
        // The class setWarning() adds; the newer setDestructive() needs a newer Obsidian than minAppVersion.
        b.buttonEl.addClass("mod-warning");
        b.setButtonText("Delete trip").onClick(() => {
          this.close();
          this.onConfirm();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
