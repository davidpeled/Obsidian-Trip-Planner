// @vitest-environment happy-dom
import type { App, Plugin } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTripContainer } from "../../bootstrap/container";
import { click, flush, setting, type } from "../../test-support/dom-helpers";
import { InMemorySettingsRepository, InMemoryWorkspaceGateway } from "../in-memory/in-memory-adapters";
import { InMemoryTripVaultRepository } from "../in-memory/in-memory-trip-vault.repository";
import { FolderSuggest } from "./folder-suggest";
import { TripSettingTab } from "./settings.tab";

vi.mock("./folder-suggest", () => ({ FolderSuggest: vi.fn() }));

async function show(saved: Record<string, unknown> | null = null) {
  const repository = new InMemorySettingsRepository(saved);
  const { settings } = await createTripContainer({
    vault: new InMemoryTripVaultRepository(),
    workspace: new InMemoryWorkspaceGateway(),
    settingsRepository: repository,
    clock: () => "2026-04-02",
  });
  const tab = new TripSettingTab({} as App, {} as Plugin, settings);
  tab.display();
  const c = tab.containerEl;
  return {
    settings,
    repository,
    tab,
    c,
    folder: () => setting(c, "Default location").querySelector("input")!,
    toggle: () => setting(c, "Open overview after creating").querySelector(".checkbox-container")!,
  };
}

/** The definitions as the tests read them: every one of ours is a plain control with a name and description. */
interface Def {
  name: string;
  desc: string;
  aliases?: string[];
  control: { type: string; key: string; placeholder?: string };
}
const definitions = (tab: TripSettingTab) => tab.getSettingDefinitions() as unknown as Def[];

describe("TripSettingTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(FolderSuggest).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("shows the current settings", async () => {
    const s = await show({ defaultLocation: "Areas/Trips", openOverviewAfterCreate: false });
    expect(s.folder().value).toBe("Areas/Trips");
    expect(s.toggle().classList.contains("is-enabled")).toBe(false);
    expect((await show()).toggle().classList.contains("is-enabled")).toBe(true); // on by default
  });

  it("explains each setting", async () => {
    const { c } = await show();
    expect(setting(c, "Default location").querySelector(".setting-item-description")?.textContent).toContain("You can pick another one for each trip");
    expect(setting(c, "Open overview after creating").querySelector(".setting-item-description")?.textContent).toBeTruthy();
  });

  it("saves the location once typing pauses, not on every keystroke", async () => {
    const s = await show();
    type(s.folder(), "A");
    type(s.folder(), "Ar");
    type(s.folder(), "Areas/Travel");
    vi.advanceTimersByTime(399);
    await flush();
    expect(s.settings.get().defaultLocation).toBe("Trips"); // still waiting
    vi.advanceTimersByTime(1);
    await flush();
    expect(s.settings.get().defaultLocation).toBe("Areas/Travel");
    expect(s.repository.saved).toMatchObject({ defaultLocation: "Areas/Travel" });
  });

  it("tidies the location it saves", async () => {
    const s = await show();
    type(s.folder(), " /Areas//Travel/ ");
    vi.advanceTimersByTime(400);
    await flush();
    expect(s.settings.get().defaultLocation).toBe("Areas/Travel");
  });

  it("suggests the vault's folders, and saves a picked one right away", async () => {
    const s = await show();
    expect(FolderSuggest).toHaveBeenCalledTimes(1);
    const [, input, onPick] = vi.mocked(FolderSuggest).mock.calls[0];
    expect(input).toBe(s.folder());
    onPick("Areas/Picked");
    await flush();
    expect(s.settings.get().defaultLocation).toBe("Areas/Picked"); // no waiting for the pause
  });

  it("saves the open-overview toggle", async () => {
    const s = await show();
    click(s.toggle());
    await flush();
    expect(s.settings.get().openOverviewAfterCreate).toBe(false);
    click(s.toggle());
    await flush();
    expect(s.settings.get().openOverviewAfterCreate).toBe(true);
  });

  describe("for Obsidian 1.13+ (declarative settings and settings search)", () => {
    it("defines the same two settings display() draws, with the same wording", async () => {
      const s = await show();
      const defs = definitions(s.tab);
      const drawn = [...s.c.querySelectorAll(".setting-item")].map((row) => [
        row.querySelector(".setting-item-name")?.textContent,
        row.querySelector(".setting-item-description")?.textContent,
      ]);
      expect(defs.map((d) => [d.name, d.desc])).toEqual(drawn);
    });

    it("uses a folder picker for the location and a toggle for the overview", async () => {
      const [location, overview] = definitions((await show()).tab);
      expect(location.control).toEqual({ type: "folder", key: "defaultLocation", placeholder: "Trips" });
      expect(overview.control).toEqual({ type: "toggle", key: "openOverviewAfterCreate" });
    });

    it("gives each setting search terms beyond its name", async () => {
      const defs = definitions((await show()).tab);
      expect(defs.every((d) => (d.aliases ?? []).length > 0)).toBe(true);
    });

    it("reads the current values", async () => {
      const s = await show({ defaultLocation: "Areas/Trips", openOverviewAfterCreate: false });
      expect(s.tab.getControlValue("defaultLocation")).toBe("Areas/Trips");
      expect(s.tab.getControlValue("openOverviewAfterCreate")).toBe(false);
      expect(s.tab.getControlValue("somethingElse")).toBeUndefined();
    });

    it("saves what Obsidian sets, tidying the location", async () => {
      const s = await show();
      await s.tab.setControlValue("defaultLocation", " /Areas//Travel/ ");
      await s.tab.setControlValue("openOverviewAfterCreate", false);
      expect(s.settings.get()).toEqual({ defaultLocation: "Areas/Travel", openOverviewAfterCreate: false });
      expect(s.repository.saved).toEqual({ defaultLocation: "Areas/Travel", openOverviewAfterCreate: false });
    });

    it("ignores values of the wrong type and keys it doesn't have", async () => {
      const s = await show();
      await s.tab.setControlValue("defaultLocation", 5);
      await s.tab.setControlValue("openOverviewAfterCreate", "yes");
      await s.tab.setControlValue("nonsense", "x");
      expect(s.settings.get()).toEqual({ defaultLocation: "Trips", openOverviewAfterCreate: true });
      expect(s.repository.saved).toBeNull(); // nothing was saved
    });

    it("every key it defines is a real setting", async () => {
      const s = await show();
      const keys = definitions(s.tab).map((d) => d.control.key);
      expect(keys.sort()).toEqual(Object.keys(s.settings.get()).sort());
    });
  });

  it("draws fresh each time it is shown, not on top of itself", async () => {
    const s = await show();
    s.tab.display();
    s.tab.display();
    expect(s.c.querySelectorAll(".setting-item")).toHaveLength(2);
  });
});
