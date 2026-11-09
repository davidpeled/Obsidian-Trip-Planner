import type { Trip, TripDraft } from "../../domain/contracts/trip";

export type CreateTripResult = { ok: true; overviewPath: string } | { ok: false; error: string };

export type DeleteTripResult = { ok: true } | { ok: false; error: string };

export interface TripService {
  /** Every trip in the vault, wherever its folder is, sorted by start date. */
  list(): Promise<Trip[]>;
  /** Scaffold a trip's folder and notes. Fails without leaving anything behind on an invalid draft, an existing folder, or a write error. Creates are serialized. */
  create(draft: TripDraft): Promise<CreateTripResult>;
  /**
   * Why a trip called `name` can't go in `location`, or null when it can: the location is unusable, or the trip's
   * folder (`location/name`) already exists. A blank name has no problem yet, so a form can ask while it is filled in.
   */
  folderProblem(location: string, name: string): Promise<string | null>;
  /** How many files deleting the trip in `folder` would move to the trash. */
  fileCount(folder: string): Promise<number>;
  /** Move a trip's whole folder to the trash. Refuses any folder that isn't exactly one trip's own (`Trip.ownsFolder`). */
  delete(folder: string): Promise<DeleteTripResult>;
}
