import { ItemView, Notice, WorkspaceLeaf, debounce, setIcon } from "obsidian";
import { ConfirmDeleteModal } from "./confirm-delete.modal";
import type { TripsController } from "../../application/controllers/trips.controller";
import type { DashboardLink, LinkKind, TripCard } from "../../application/contracts/dashboard";

export const VIEW_TYPE_TRIPS = "trip-planner-dashboard";

const REFRESH_PAUSE_MS = 300;

/** The main page: every trip under the trips folder, with quick links to its notes. */
export class TripsView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly controller: TripsController,
    private readonly onNewTrip: () => void
  ) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string {
    return VIEW_TYPE_TRIPS;
  }

  getDisplayText(): string {
    return "Trips";
  }

  getIcon(): string {
    return "plane";
  }

  async onOpen(): Promise<void> {
    const refresh = debounce(() => void this.render(), REFRESH_PAUSE_MS, true);
    const onPath = (path: string) => this.controller.affects(path) && refresh();

    // A note that is (or just became) one of ours can add or change a trip wherever it sits in the vault.
    this.registerEvent(
      this.app.metadataCache.on("changed", (file, _data, cache) => this.controller.affectsChange(file.path, cache.frontmatter) && refresh())
    );
    this.registerEvent(this.app.vault.on("create", (file) => onPath(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => onPath(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => (onPath(file.path), onPath(oldPath))));
    // Coming back to the view also catches a new day ("Day 3 of 10" moves on at midnight).
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => leaf === this.leaf && refresh()));

    await this.render();
  }

  /** Renders overlap (edits fire while one is in flight); only the newest read may draw. */
  private renderSeq = 0;

  private async render(): Promise<void> {
    const seq = ++this.renderSeq;
    const dashboard = await this.controller.dashboard();
    if (seq !== this.renderSeq) return;
    const root = this.contentEl;
    root.empty();
    root.addClass("trip-planner");

    const count = dashboard.sections.reduce((n, s) => n + s.trips.length, 0);
    const header = root.createDiv({ cls: "trip-planner-header" });
    const heading = header.createDiv();
    heading.createEl("h2", { text: "Trips" });
    if (count > 0) heading.createDiv({ cls: "trip-planner-subtitle", text: `${count} ${count === 1 ? "trip" : "trips"}` });
    if (count > 0) this.newTripButton(header, "mod-cta");

    if (count === 0) return this.renderEmpty(root);
    for (const section of dashboard.sections) {
      const block = root.createEl("section", { cls: "trip-planner-section" });
      block.createEl("h3", { text: section.title });
      const grid = block.createDiv({ cls: "trip-planner-grid" });
      section.trips.forEach((trip) => this.renderCard(grid, trip, section.id));
    }
  }

  private newTripButton(parent: HTMLElement, cls: string): void {
    const button = parent.createEl("button", { cls: ["trip-planner-new", cls] });
    setIcon(button.createSpan({ cls: "trip-planner-icon" }), "plus");
    button.createSpan({ text: "New trip" });
    button.addEventListener("click", () => this.onNewTrip());
  }

  private renderEmpty(root: HTMLElement): void {
    const empty = root.createDiv({ cls: "trip-planner-empty" });
    setIcon(empty.createDiv({ cls: "trip-planner-empty-icon" }), "plane");
    empty.createEl("h3", { text: "Where to next?" });
    empty.createEl("p", { text: "Each trip gets an overview, flights, transportation and a note for every day, in the folder you choose." });
    this.newTripButton(empty, "mod-cta");
  }

  private renderCard(parent: HTMLElement, trip: TripCard, status: string): void {
    const card = parent.createDiv({ cls: ["trip-planner-card", `is-${status}`] });

    const top = card.createDiv({ cls: "trip-planner-card-top" });
    this.link(top, trip.overview, trip.name, "trip-planner-trip-name");
    const end = top.createDiv({ cls: "trip-planner-card-end" });
    end.createSpan({ cls: "trip-planner-badge", text: trip.badge });
    if (trip.deletable) {
      const guide = end.createEl("button", { cls: "trip-planner-agent-guide", attr: { "aria-label": `Add agent guide to ${trip.name}` } });
      setIcon(guide, "bot");
      guide.addEventListener("click", () => void this.addAgentGuide(trip));
      const remove = end.createEl("button", { cls: "trip-planner-delete", attr: { "aria-label": `Delete ${trip.name}` } });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => void this.confirmDelete(trip));
    }

    card.createDiv({ cls: "trip-planner-dates", text: trip.dateRange });

    if (trip.progress !== null) {
      const bar = card.createDiv({ cls: "trip-planner-progress", attr: { role: "presentation" } });
      bar.createDiv({ cls: "trip-planner-progress-fill" }).setCssProps({ "--trip-progress": `${Math.round(trip.progress * 100)}%` });
    }

    // The title links to the overview, so the chips only carry the other notes.
    const links = card.createDiv({ cls: "trip-planner-links" });
    trip.quickLinks.forEach((l) => this.link(links, l, l.label, "trip-planner-chip"));

    if (trip.days.length > 0) {
      const details = card.createEl("details", { cls: "trip-planner-days" });
      details.open = status === "current";
      details.createEl("summary", { text: `Schedule · ${trip.days.length} ${trip.days.length === 1 ? "day" : "days"}` });
      const list = details.createDiv({ cls: "trip-planner-day-list" });
      for (const day of trip.days) {
        const button = this.link(list, day, "", day.isToday ? "trip-planner-day is-today" : "trip-planner-day");
        button.createSpan({ cls: "trip-planner-day-number", text: String(day.number) });
        button.createSpan({ text: day.label });
      }
    }
  }

  private async addAgentGuide(trip: TripCard): Promise<void> {
    const result = await this.controller.addAgentGuide(trip.folder);
    new Notice(result.ok ? `Added AGENTS.md to ${trip.name}` : result.error);
  }

  private async confirmDelete(trip: TripCard): Promise<void> {
    const fileCount = await this.controller.fileCount(trip.folder);
    new ConfirmDeleteModal(this.app, { name: trip.name, folder: trip.folder, fileCount }, () => {
      void this.controller.delete(trip.folder).then((result) => {
        new Notice(result.ok ? `Moved ${trip.name} to the trash` : result.error);
        return this.render();
      });
    }).open();
  }

  /** A button that opens a note; Ctrl/Cmd-click or middle-click opens it in a new tab. */
  private link(parent: HTMLElement, target: DashboardLink, text: string, cls: string): HTMLButtonElement {
    const button = parent.createEl("button", { cls: ["trip-planner-link", ...cls.split(" ")] });
    const icon = ICONS[target.kind];
    if (icon && cls.includes("trip-planner-chip")) setIcon(button.createSpan({ cls: "trip-planner-icon" }), icon);
    if (text) button.createSpan({ text });
    button.addEventListener("click", (e) => void this.controller.open(target.path, e.ctrlKey || e.metaKey));
    button.addEventListener("auxclick", (e) => e.button === 1 && void this.controller.open(target.path, true));
    return button;
  }
}

const ICONS: Partial<Record<LinkKind, string>> = {
  today: "calendar-check",
  flights: "plane",
  transportation: "train-front",
  attractions: "landmark",
  tickets: "ticket",
  hotels: "bed-double",
  packing: "luggage",
  documents: "file-text",
};
