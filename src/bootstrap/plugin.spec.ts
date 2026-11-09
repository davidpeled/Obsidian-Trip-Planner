// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripsView, VIEW_TYPE_TRIPS } from "../infrastructure/obsidian/trips.view";
import { NewTripModal } from "../infrastructure/obsidian/new-trip.modal";
import { TripSettingTab } from "../infrastructure/obsidian/settings.tab";
import { buttonLabelled, click, setting, type } from "../test-support/dom-helpers";
import { FakeObsidianApp } from "../test-support/fake-obsidian-app";
import { Modal, Notice, Plugin as StubPlugin, WorkspaceLeaf } from "../test-support/obsidian.stub";
import TripPlannerPlugin from "./plugin";

async function load(saved: Record<string, unknown> | null = null) {
  const app = new FakeObsidianApp();
  const plugin = new TripPlannerPlugin(app.asApp(), {} as never);
  const host = plugin as unknown as StubPlugin; // the stub records what the plugin registers
  host.data = saved;
  await plugin.onload();
  return {
    app,
    host,
    command: (id: string) => host.commands.find((c) => c.id === id)!,
    ribbon: () => host.ribbonIcons[0],
  };
}

describe("main.ts", () => {
  it("exports the plugin class as Obsidian expects (the default export)", async () => {
    expect((await import("../main")).default).toBe(TripPlannerPlugin);
  });
});

describe("TripPlannerPlugin", () => {
  beforeEach(() => {
    Notice.messages.length = 0;
  });
  afterEach(() => {
    Modal.open.length = 0;
  });

  it("registers the dashboard view", async () => {
    const { host, app } = await load();
    const creator = host.views.get(VIEW_TYPE_TRIPS);
    expect(creator).toBeDefined();
    const view = creator!(new WorkspaceLeaf(app.asApp()));
    expect(view).toBeInstanceOf(TripsView);
    expect((view as unknown as TripsView).getViewType()).toBe(VIEW_TYPE_TRIPS);
  });

  it("adds a ribbon icon and two commands", async () => {
    const { host, ribbon } = await load();
    expect(ribbon()).toMatchObject({ icon: "plane", title: "Open trips" });
    expect(host.commands.map((c) => [c.id, c.name])).toEqual([
      ["open-dashboard", "Open trips"],
      ["new-trip", "Create new trip"],
    ]);
  });

  it("adds the settings tab", async () => {
    const { host } = await load();
    expect(host.settingTabs).toHaveLength(1);
    expect(host.settingTabs[0]).toBeInstanceOf(TripSettingTab);
  });

  describe("opening the dashboard", () => {
    it("opens it in a new tab from the ribbon", async () => {
      const { app, ribbon } = await load();
      await ribbon().callback();
      expect(app.leafRequests).toEqual(["tab"]);
      expect(app.leaves[0].viewState).toEqual({ type: VIEW_TYPE_TRIPS, active: true });
      expect(app.revealed).toEqual([app.leaves[0]]);
    });

    it("opens it from the command too", async () => {
      const { app, command } = await load();
      await command("open-dashboard").callback!();
      expect(app.leaves[0].viewState?.type).toBe(VIEW_TYPE_TRIPS);
      expect(app.revealed).toHaveLength(1);
    });

    it("reuses the open dashboard instead of making another", async () => {
      const { app, ribbon, command } = await load();
      await ribbon().callback();
      await command("open-dashboard").callback!();
      await ribbon().callback();
      expect(app.leafRequests).toEqual(["tab"]); // one tab, ever
      expect(app.revealed).toHaveLength(3); // but it is brought to the front each time
      expect(new Set(app.revealed).size).toBe(1);
    });
  });

  describe("creating a trip", () => {
    it("opens the form from the command, starting at the saved default location", async () => {
      const { command } = await load({ defaultLocation: "Areas/Trips" });
      await command("new-trip").callback!();
      expect(Modal.open).toHaveLength(1);
      const modal = Modal.open[0];
      expect(modal).toBeInstanceOf(NewTripModal);
      expect(setting(modal.contentEl, "Location").querySelector("input")!.value).toBe("Areas/Trips");
    });

    it("creates the trip in the vault, end to end, and opens its overview", async () => {
      const { app, command } = await load();
      await command("new-trip").callback!();
      const form = Modal.open[0].contentEl;
      type(setting(form, "Name").querySelector("input")!, "UK-trip");
      type(setting(form, "Location").querySelector("input")!, "Areas/Trips");
      type(setting(form, "Start date").querySelector("input")!, "2026-04-01");
      type(setting(form, "End date").querySelector("input")!, "2026-04-02");
      click(buttonLabelled(form, "Create trip"));
      await vi.waitFor(() => expect(Notice.messages).toEqual(["Created UK-trip"])); // the adapter awaits folder by folder, note by note

      const files = app.filePaths();
      expect(files).toEqual(
        expect.arrayContaining([
          "Areas/Trips/UK-trip/Overview.md",
          "Areas/Trips/UK-trip/Flights.md",
          "Areas/Trips/UK-trip/Hotels/Index.md",
          "Areas/Trips/UK-trip/Tickets/Index.md",
          "Areas/Trips/UK-trip/Packing/Index.md",
          "Areas/Trips/UK-trip/Documents/Index.md",
          "Areas/Trips/UK-trip/Schedule/2026-04-01 Wed.md",
          "Areas/Trips/UK-trip/Schedule/2026-04-02 Thu.md",
        ])
      );
      expect(app.folderPaths()).toEqual(expect.arrayContaining(["Areas", "Areas/Trips", "Areas/Trips/UK-trip/Tickets"]));
      expect(Notice.messages).toEqual(["Created UK-trip"]);
      expect(app.leaves.at(-1)?.opened.map((f) => f.path)).toEqual(["Areas/Trips/UK-trip/Overview.md"]);
    });

    it("keeps the overview closed when the setting says so", async () => {
      const { app, command } = await load({ openOverviewAfterCreate: false });
      await command("new-trip").callback!();
      const form = Modal.open[0].contentEl;
      type(setting(form, "Name").querySelector("input")!, "Rome");
      click(buttonLabelled(form, "Create trip"));
      await vi.waitFor(() => expect(Notice.messages).toEqual(["Created Rome"]));
      expect(app.filePaths()).toContain("Trips/Rome/Overview.md");
      expect(app.leaves.flatMap((l) => l.opened)).toEqual([]);
    });
  });
});
