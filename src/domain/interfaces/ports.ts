import type { IsoDate } from "../model/dates";
import type { TripPlan, VaultNote } from "../contracts/trip";

/** Outbound port: the notes and folders trips live in. */
export interface TripVaultRepository {
  /** Every markdown note in the vault whose frontmatter `type` is one of `types`, with its frontmatter. */
  listTypedNotes(types: readonly string[]): Promise<VaultNote[]>;
  /** Whether a file or folder exists at `path`, ignoring letter case: macOS and Windows treat `Trips` and `trips` as one folder. */
  exists(path: string): Promise<boolean>;
  /**
   * Create the plan's folders (and any missing parents), then its notes. All or nothing: it rejects if any
   * note already exists, and on any failure removes the folders and notes this call created (and only those).
   */
  write(plan: TripPlan): Promise<void>;
  /** How many files (notes, PDFs, images) are in `folder`, at any depth. */
  countFiles(folder: string): Promise<number>;
  /** Move `folder` and everything in it to the trash. Rejects for the vault root. */
  trash(folder: string): Promise<void>;
}

/** Outbound port: showing a note to the user. */
export interface WorkspaceGateway {
  openNote(path: string, options?: { newTab?: boolean }): Promise<void>;
}

/** Outbound port: opaque settings storage (a JSON object). The settings service validates the shape. */
export interface SettingsRepository {
  load(): Promise<Record<string, unknown> | null>;
  save(data: Record<string, unknown>): Promise<void>;
}

/** Outbound port: today's date on the user's calendar. */
export type Clock = () => IsoDate;
