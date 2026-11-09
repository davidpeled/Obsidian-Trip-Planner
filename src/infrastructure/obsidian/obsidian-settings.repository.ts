import type { Plugin } from "obsidian";
import type { SettingsRepository } from "../../domain/interfaces/ports";

/** Persists settings in the plugin's data.json. */
export class ObsidianSettingsRepository implements SettingsRepository {
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<Record<string, unknown> | null> {
    const data: unknown = await this.plugin.loadData();
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    await this.plugin.saveData(data);
  }
}
