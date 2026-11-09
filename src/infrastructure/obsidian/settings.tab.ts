import { App, Plugin, PluginSettingTab, Setting, type SettingDefinitionItem, debounce } from "obsidian";
import { FolderSuggest } from "./folder-suggest";
import type { SettingsService } from "../../application/contracts/settings";

const TYPING_PAUSE_MS = 400;

// One wording for both ways of drawing the tab, so they can't drift apart.
const LOCATION = {
  name: "Default location",
  desc: "The folder the new trip form starts with. You can pick another one for each trip, and the dashboard finds trips anywhere in the vault.",
};
const OPEN_OVERVIEW = {
  name: "Open overview after creating",
  desc: "Open the new trip's overview note right away.",
};

/**
 * Obsidian 1.13 and later draw this tab from `getSettingDefinitions()`, which also puts the settings in the
 * settings search; it does not call `display()` then. `display()` draws the same two settings for the older
 * versions this plugin still supports (minAppVersion 1.7.2).
 */
export class TripSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: SettingsService
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { ...LOCATION, aliases: ["folder", "trips folder", "where"], control: { type: "folder", key: "defaultLocation", placeholder: "Trips" } },
      { ...OPEN_OVERVIEW, aliases: ["open", "overview"], control: { type: "toggle", key: "openOverviewAfterCreate" } },
    ];
  }

  getControlValue(key: string): unknown {
    return key === "defaultLocation" || key === "openOverviewAfterCreate" ? this.settings.get()[key] : undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "defaultLocation" && typeof value === "string") await this.settings.update({ defaultLocation: value });
    if (key === "openOverviewAfterCreate" && typeof value === "boolean") await this.settings.update({ openOverviewAfterCreate: value });
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.settings.get();

    new Setting(containerEl)
      .setName(LOCATION.name)
      .setDesc(LOCATION.desc)
      .addText((t) => {
        t.setPlaceholder("Trips").setValue(s.defaultLocation);
        const save = (v: string) => void this.settings.update({ defaultLocation: v });
        // Typing: commit once it pauses. Picking a suggestion: commit right away.
        t.onChange(debounce(save, TYPING_PAUSE_MS, true));
        new FolderSuggest(this.app, t.inputEl, save);
      });

    new Setting(containerEl)
      .setName(OPEN_OVERVIEW.name)
      .setDesc(OPEN_OVERVIEW.desc)
      .addToggle((t) => t.setValue(s.openOverviewAfterCreate).onChange((v) => void this.settings.update({ openOverviewAfterCreate: v })));
  }
}
