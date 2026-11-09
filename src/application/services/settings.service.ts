import { DEFAULT_SETTINGS, type PluginSettings } from "../../domain/contracts/settings";
import type { SettingsRepository } from "../../domain/interfaces/ports";
import { normalizeLocation } from "../../domain/model/trip-scaffold";
import type { SettingsService } from "../contracts/settings";

/** Keeps only well-typed values, so a hand-edited or older data.json can't break the plugin. */
export function sanitizeSettings(raw: Record<string, unknown> | Partial<PluginSettings> | null): PluginSettings {
  const data: Record<string, unknown> = raw ?? {};
  // The old name of the setting, from when every trip went into one folder.
  const saved = data.defaultLocation ?? data.tripsFolder;
  const folder = typeof saved === "string" ? normalizeLocation(saved) : "";
  return {
    defaultLocation: folder || DEFAULT_SETTINGS.defaultLocation,
    openOverviewAfterCreate:
      typeof data.openOverviewAfterCreate === "boolean" ? data.openOverviewAfterCreate : DEFAULT_SETTINGS.openOverviewAfterCreate,
  };
}

export async function createSettingsService(repository: SettingsRepository): Promise<SettingsService> {
  let current = sanitizeSettings(await repository.load());
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    async update(patch) {
      current = sanitizeSettings({ ...current, ...patch });
      await repository.save({ ...current });
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
