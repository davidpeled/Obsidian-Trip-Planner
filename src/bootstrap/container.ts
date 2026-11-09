import { TripsController } from "../application/controllers/trips.controller";
import type { SettingsService } from "../application/contracts/settings";
import { createSettingsService } from "../application/services/settings.service";
import { createTripService } from "../application/services/trip.service";
import type { Clock, SettingsRepository, TripVaultRepository, WorkspaceGateway } from "../domain/interfaces/ports";

/** Everything host-specific. Obsidian and the tests each provide one set. */
export interface TripAdapters {
  vault: TripVaultRepository;
  workspace: WorkspaceGateway;
  settingsRepository: SettingsRepository;
  clock: Clock;
}

export interface TripContainer {
  settings: SettingsService;
  controller: TripsController;
}

/** Composition root shared by the Obsidian plugin and the tests. */
export async function createTripContainer(adapters: TripAdapters): Promise<TripContainer> {
  const settings = await createSettingsService(adapters.settingsRepository);
  const trips = createTripService({ vault: adapters.vault, clock: adapters.clock });
  const controller = new TripsController(trips, settings, adapters.workspace, adapters.clock);
  return { settings, controller };
}
