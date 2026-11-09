import { App, Modal, Notice, Setting } from "obsidian";
import type { TripsController } from "../../application/controllers/trips.controller";
import { addDays } from "../../domain/model/dates";
import { FolderSuggest } from "./folder-suggest";

const DEFAULT_TRIP_DAYS = 7;

/** The "new trip" form: a name, where to put it, and the dates. */
export class NewTripModal extends Modal {
  private name = "";
  private location: string;
  private start: string;
  private end: string;

  private busy = false;
  /** Why the folder can't be used (it exists, or the location is invalid); blocks Create until fixed. */
  private problem: string | null = null;
  private checkSeq = 0;
  private createButton: HTMLButtonElement | null = null;
  private showError: (message: string) => void = () => undefined;
  private showPath: () => void = () => undefined;

  constructor(
    app: App,
    private readonly controller: TripsController
  ) {
    super(app);
    this.location = controller.defaultLocation();
    this.start = controller.today();
    this.end = addDays(this.start, DEFAULT_TRIP_DAYS - 1);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle("New trip");

    new Setting(contentEl)
      .setName("Name")
      .setDesc("Becomes the trip's folder name.")
      .addText((t) => {
        t.setPlaceholder("UK trip").onChange((v) => {
          this.name = v;
          this.showPath();
        });
        t.inputEl.addEventListener("keydown", (e) => e.key === "Enter" && void this.submit());
        window.setTimeout(() => t.inputEl.focus());
      });

    const where = new Setting(contentEl).setName("Location").addText((t) => {
      t.setPlaceholder("Areas/Trips").setValue(this.location);
      t.onChange((v) => {
        this.location = v;
        this.showPath();
      });
      new FolderSuggest(this.app, t.inputEl, (path) => {
        this.location = path;
        this.showPath();
      });
    });
    this.showPath = () => {
      const folder = this.controller.folderFor(this.location, this.name || "…");
      where.setDesc(`Creates ${folder}/. Folders that don't exist yet are created.`);
      where.descEl.classList.remove("mod-warning");
      void this.check(where);
    };
    this.showPath();

    let endInput: HTMLInputElement | null = null;
    new Setting(contentEl).setName("Start date").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.start).onChange((v) => {
        this.start = v;
        // Keep the end from falling before the start: move it along with the start.
        if (v && this.end < v) {
          this.end = v;
          if (endInput) endInput.value = v;
        }
      });
    });
    new Setting(contentEl).setName("End date").addText((t) => {
      endInput = t.inputEl;
      t.inputEl.type = "date";
      t.setValue(this.end).onChange((v) => (this.end = v));
    });

    const error = contentEl.createDiv({ cls: "trip-planner-error mod-warning" });
    error.hide();
    this.showError = (message) => {
      error.setText(message);
      error.show();
    };

    new Setting(contentEl).addButton((b) => {
      b.setButtonText("Create trip").setCta().onClick(() => void this.submit());
      this.createButton = b.buttonEl;
    });
  }

  /**
   * Asks whether the trip's folder is free, and shows the answer where the path is shown. Answers can arrive out of
   * order while you type, so only the newest question counts.
   */
  private async check(where: Setting): Promise<void> {
    const seq = ++this.checkSeq;
    const problem = await this.controller.folderProblem(this.location, this.name);
    if (seq !== this.checkSeq) return;
    this.problem = problem;
    if (problem) {
      where.setDesc(problem);
      where.descEl.classList.add("mod-warning");
    }
    this.updateButton();
  }

  private updateButton(): void {
    this.createButton?.toggleAttribute("disabled", this.busy || this.problem !== null);
  }

  private async submit(): Promise<void> {
    if (this.busy || this.problem) return; // a double click, Enter-then-click, or a taken folder: nothing to create
    this.busy = true;
    this.updateButton();
    const result = await this.controller.create({ name: this.name, location: this.location, start: this.start, end: this.end });
    this.busy = false;
    this.updateButton();
    if (!result.ok) return this.showError(result.error);
    new Notice(`Created ${this.name.trim()}`);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
