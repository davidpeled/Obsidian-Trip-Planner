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

  it("draws fresh each time it is shown, not on top of itself", async () => {
    const s = await show();
    s.tab.display();
    s.tab.display();
    expect(s.c.querySelectorAll(".setting-item")).toHaveLength(2);
  });
});
