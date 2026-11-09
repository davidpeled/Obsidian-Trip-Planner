import { App, Plugin, PluginSettingTab, Setting, debounce } from "obsidian";
import { FolderSuggest } from "./folder-suggest";
import type { SettingsService } from "../../application/contracts/settings";

const TYPING_PAUSE_MS = 400;

export class TripSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: SettingsService
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.settings.get();

    new Setting(containerEl)
      .setName("Default location")
      .setDesc("The folder the new trip form starts with. You can pick another one for each trip, and the dashboard finds trips anywhere in the vault.")
      .addText((t) => {
        t.setPlaceholder("Trips").setValue(s.defaultLocation);
        const save = (v: string) => void this.settings.update({ defaultLocation: v });
        // Typing: commit once it pauses. Picking a suggestion: commit right away.
        t.onChange(debounce(save, TYPING_PAUSE_MS, true));
        new FolderSuggest(this.app, t.inputEl, save);
      });

    new Setting(containerEl)
      .setName("Open overview after creating")
      .setDesc("Open the new trip's overview note right away.")
      .addToggle((t) => t.setValue(s.openOverviewAfterCreate).onChange((v) => void this.settings.update({ openOverviewAfterCreate: v })));
  }
}
