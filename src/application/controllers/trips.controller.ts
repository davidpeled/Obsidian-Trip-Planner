import { TRIP_NOTE_TYPES, type TripDraft } from "../../domain/contracts/trip";
import type { Clock, WorkspaceGateway } from "../../domain/interfaces/ports";
import { tripFolder } from "../../domain/model/trip-scaffold";
import type { DashboardView } from "../contracts/dashboard";
import type { SettingsService } from "../contracts/settings";
import type { AddAgentGuideResult, CreateTripResult, DeleteTripResult, TripService } from "../contracts/trip-service";
import { toDashboard } from "../mappers/dashboard.mapper";

/** What the dashboard view and the "new trip" form talk to. No Obsidian types in or out. */
export class TripsController {
  /** Folders of the trips the last dashboard showed. Set by `dashboard()`, so `affects` only knows trips once one was built. */
  private knownFolders: string[] = [];

  constructor(
    private readonly trips: TripService,
    private readonly settings: SettingsService,
    private readonly workspace: WorkspaceGateway,
    private readonly clock: Clock
  ) {}

  async dashboard(): Promise<DashboardView> {
    const trips = await this.trips.list();
    this.knownFolders = trips.map((t) => t.folder);
    return toDashboard(trips, this.clock());
  }

  open(path: string, newTab = false): Promise<void> {
    return this.workspace.openNote(path, { newTab });
  }

  today() {
    return this.clock();
  }

  /** Where the "new trip" form starts. */
  defaultLocation(): string {
    return this.settings.get().defaultLocation;
  }

  /** The folder a trip called `name` would be created in, for the form's preview. */
  folderFor(location: string, name: string): string {
    return tripFolder(location, name);
  }

  /** Why a trip called `name` can't go in `location` (see `TripService.folderProblem`), or null. */
  folderProblem(location: string, name: string): Promise<string | null> {
    return this.trips.folderProblem(location, name);
  }

  /** Creates the trip and, when the setting is on, opens its overview. */
  async create(draft: TripDraft): Promise<CreateTripResult> {
    const result = await this.trips.create(draft);
    if (result.ok && this.settings.get().openOverviewAfterCreate) await this.open(result.overviewPath);
    return result;
  }

  /** Adds the agent guide to a trip and, when the setting is on, opens it. */
  async addAgentGuide(folder: string): Promise<AddAgentGuideResult> {
    const result = await this.trips.addAgentGuide(folder);
    if (result.ok && this.settings.get().openOverviewAfterCreate) await this.open(result.path);
    return result;
  }

  fileCount(folder: string): Promise<number> {
    return this.trips.fileCount(folder);
  }

  delete(folder: string): Promise<DeleteTripResult> {
    return this.trips.delete(folder);
  }

  /**
   * Whether a metadata change can alter the dashboard: the note is one of ours (it can add, move or change a trip
   * anywhere in the vault), or `affects(path)`.
   */
  affectsChange(path: string, frontmatter: Record<string, unknown> | undefined): boolean {
    const type = frontmatter?.type;
    return (typeof type === "string" && TRIP_NOTE_TYPES.includes(type)) || this.affects(path);
  }

  /**
   * Whether a change at `path` can alter the dashboard: it's inside a trip we show, or inside the default
   * location (where new trips appear). A trip created or edited elsewhere is caught by its own note type.
   */
  affects(path: string): boolean {
    return [...this.knownFolders, this.settings.get().defaultLocation].some((folder) => path === folder || path.startsWith(`${folder}/`));
  }
}
