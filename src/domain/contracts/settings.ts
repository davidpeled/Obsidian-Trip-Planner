export interface PluginSettings {
  /** Where the "new trip" form puts a trip unless you pick another folder. */
  defaultLocation: string;
  /** Open the new trip's overview note right after creating it. */
  openOverviewAfterCreate: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultLocation: "Trips",
  openOverviewAfterCreate: true,
};
