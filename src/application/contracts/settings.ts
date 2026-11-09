import type { PluginSettings } from "../../domain/contracts/settings";

export type { PluginSettings };

export interface SettingsService {
  get(): PluginSettings;
  update(patch: Partial<PluginSettings>): Promise<void>;
  /** Called after every change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
