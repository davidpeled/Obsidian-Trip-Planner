import { Plugin } from "obsidian";
import { NewTripModal } from "../infrastructure/obsidian/new-trip.modal";
import { ObsidianSettingsRepository } from "../infrastructure/obsidian/obsidian-settings.repository";
import { ObsidianTripVaultRepository } from "../infrastructure/obsidian/obsidian-trip-vault.repository";
import { ObsidianWorkspaceGateway } from "../infrastructure/obsidian/obsidian-workspace.gateway";
import { TripSettingTab } from "../infrastructure/obsidian/settings.tab";
import { TripsView, VIEW_TYPE_TRIPS } from "../infrastructure/obsidian/trips.view";
import { systemClock } from "../infrastructure/system/system-clock";
import { createTripContainer } from "./container";

/** Obsidian entry point: binds the Obsidian adapters and registers the UI. */
export default class TripPlannerPlugin extends Plugin {
  async onload(): Promise<void> {
    const { controller, settings } = await createTripContainer({
      vault: new ObsidianTripVaultRepository(this.app),
      workspace: new ObsidianWorkspaceGateway(this.app),
      settingsRepository: new ObsidianSettingsRepository(this),
      clock: systemClock,
    });
    const newTrip = () => new NewTripModal(this.app, controller).open();

    this.registerView(VIEW_TYPE_TRIPS, (leaf) => new TripsView(leaf, controller, newTrip));
    this.addRibbonIcon("plane", "Open trips", () => void this.activateView());
    this.addCommand({ id: "open-dashboard", name: "Open trips", callback: () => void this.activateView() });
    this.addCommand({ id: "new-trip", name: "Create new trip", callback: newTrip });
    this.addSettingTab(new TripSettingTab(this.app, this, settings));
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_TRIPS)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_TRIPS, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
