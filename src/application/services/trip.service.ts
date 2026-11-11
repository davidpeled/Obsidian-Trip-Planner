import type { Clock, TripVaultRepository } from "../../domain/interfaces/ports";
import { TRIP_NOTE_TYPES } from "../../domain/contracts/trip";
import { discoverTrips } from "../../domain/model/trip-discovery";
import { AGENTS_FILE, joinPath, planAgentGuide, planTrip, tripFolder, validateDraft, validateLocation, cleanTripName } from "../../domain/model/trip-scaffold";
import type { TripService } from "../contracts/trip-service";

export function createTripService(deps: { vault: TripVaultRepository; clock: Clock }): TripService {
  const { vault, clock } = deps;
  // Creates run one at a time. A second create of the same trip must see the first one's folder, and one create's
  // rollback must never touch folders another create is filling.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };

  const folderProblem = async (location: string, name: string): Promise<string | null> => {
    if (!cleanTripName(name)) return null;
    const locationError = validateLocation(location);
    if (locationError) return locationError;
    const folder = tripFolder(location, name);
    return (await vault.exists(folder)) ? `${folder} already exists. A new trip needs a folder that doesn't exist yet: pick another name or location.` : null;
  };

  const list = async () => discoverTrips(await vault.listTypedNotes(TRIP_NOTE_TYPES), clock());
  return {
    list,
    folderProblem,

    create: (draft) =>
      serialized(async () => {
        const error = validateDraft(draft);
        if (error) return { ok: false, error };
        const taken = await folderProblem(draft.location, draft.name);
        if (taken) return { ok: false, error: taken };
        const plan = planTrip(draft);
        try {
          await vault.write(plan); // all or nothing: a failed write removes what it had created
        } catch (e) {
          return { ok: false, error: `Couldn't create the trip: ${e instanceof Error ? e.message : String(e)}` };
        }
        return { ok: true, overviewPath: plan.overviewPath };
      }),

    addAgentGuide: (folder) =>
      serialized(async () => {
        const trip = (await list()).find((t) => t.folder === folder);
        if (!trip) return { ok: false, error: "That folder isn't a trip any more." };
        if (!trip.ownsFolder) return { ok: false, error: `${trip.name} shares its folder with other notes or trips, so an agent guide can't be added here.` };
        const plan = planAgentGuide(trip);
        const path = joinPath(folder, AGENTS_FILE);
        if (await vault.exists(path)) return { ok: false, error: `${trip.name} already has an ${AGENTS_FILE}.` };
        try {
          await vault.write(plan);
        } catch (e) {
          return { ok: false, error: `Couldn't add the agent guide: ${e instanceof Error ? e.message : String(e)}` };
        }
        return { ok: true, path };
      }),

    fileCount: (folder) => vault.countFiles(folder),

    async delete(folder) {
      // Only ever delete a folder that belongs to exactly one trip, whatever path the caller passes.
      const trip = (await list()).find((t) => t.folder === folder);
      if (!trip) return { ok: false, error: "That folder isn't a trip any more." };
      if (!trip.ownsFolder) return { ok: false, error: `${trip.name} shares its folder with other notes or trips, so it can't be deleted from here.` };
      try {
        await vault.trash(folder);
      } catch (e) {
        return { ok: false, error: `Couldn't delete the trip: ${e instanceof Error ? e.message : String(e)}` };
      }
      return { ok: true };
    },
  };
}
