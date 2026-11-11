// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTripContainer } from "../../bootstrap/container";
import type { DashboardView } from "../../application/contracts/dashboard";
import { buttonLabelled, click, flush, text } from "../../test-support/dom-helpers";
import { FakeObsidianApp } from "../../test-support/fake-obsidian-app";
import { Modal, Notice, WorkspaceLeaf } from "../../test-support/obsidian.stub";
import { InMemorySettingsRepository, InMemoryWorkspaceGateway } from "../in-memory/in-memory-adapters";
import { InMemoryTripVaultRepository } from "../in-memory/in-memory-trip-vault.repository";
import { TripsView, VIEW_TYPE_TRIPS } from "./trips.view";

const draft = (name: string, start: string, end: string, location = "Trips") => ({ name, location, start, end });

async function setup(trips: ReturnType<typeof draft>[] = []) {
  const app = new FakeObsidianApp();
  const vault = new InMemoryTripVaultRepository();
  const workspace = new InMemoryWorkspaceGateway();
  const { controller } = await createTripContainer({
    vault,
    workspace,
    settingsRepository: new InMemorySettingsRepository({ openOverviewAfterCreate: false }),
    clock: () => "2026-04-03",
  });
  for (const t of trips) await controller.create(t);
  const leaf = new WorkspaceLeaf(app.asApp());
  const onNewTrip = vi.fn();
  const view = new TripsView(leaf as never, controller, onNewTrip);
  const root = view.contentEl;
  return {
    app,
    vault,
    workspace,
    controller,
    leaf,
    view,
    root,
    onNewTrip,
    open: () => view.onOpen(),
    cards: () => [...root.querySelectorAll<HTMLElement>(".trip-planner-card")],
    card: (name: string) => [...root.querySelectorAll<HTMLElement>(".trip-planner-card")].find((c) => text(c.querySelector(".trip-planner-trip-name")) === name)!,
  };
}

const JAPAN = draft("Japan 2026", "2026-04-01", "2026-04-10"); // happening now on 2026-04-03
const LISBON = draft("Lisbon", "2026-05-14", "2026-05-17"); // upcoming
const TUSCANY = draft("Tuscany", "2025-09-12", "2025-09-19"); // past

describe("TripsView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Notice.messages.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    Modal.open.length = 0;
  });

  it("identifies itself to Obsidian", async () => {
    const { view } = await setup();
    expect([view.getViewType(), view.getDisplayText(), view.getIcon(), view.navigation]).toEqual([VIEW_TYPE_TRIPS, "Trips", "plane", false]);
  });

  describe("with no trips", () => {
    it("invites you to make one, with a single New trip button", async () => {
      const s = await setup();
      await s.open();
      expect(text(s.root.querySelector(".trip-planner-empty h3"))).toBe("Where to next?");
      expect(s.root.querySelectorAll("button")).toHaveLength(1);
      expect(s.root.querySelector(".trip-planner-header button")).toBeNull();
      expect(s.root.querySelector(".trip-planner-subtitle")).toBeNull();
      click(buttonLabelled(s.root, "New trip"));
      expect(s.onNewTrip).toHaveBeenCalledTimes(1);
    });
  });

  describe("with trips", () => {
    it("shows a header with the count, and a New trip button", async () => {
      const s = await setup([JAPAN, LISBON, TUSCANY]);
      await s.open();
      expect(text(s.root.querySelector("h2"))).toBe("Trips");
      expect(text(s.root.querySelector(".trip-planner-subtitle"))).toBe("3 trips");
      click(s.root.querySelector(".trip-planner-header button")!);
      expect(s.onNewTrip).toHaveBeenCalledTimes(1);
    });

    it("says '1 trip' for one", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      expect(text(s.root.querySelector(".trip-planner-subtitle"))).toBe("1 trip");
    });

    it("groups trips into sections in order", async () => {
      const s = await setup([TUSCANY, LISBON, JAPAN]);
      await s.open();
      const sections = [...s.root.querySelectorAll("section")].map((sec) => [text(sec.querySelector("h3")), [...sec.querySelectorAll(".trip-planner-trip-name")].map(text)]);
      expect(sections).toEqual([
        ["Happening now", ["Japan 2026"]],
        ["Upcoming", ["Lisbon"]],
        ["Past", ["Tuscany"]],
      ]);
      expect(s.card("Japan 2026").classList.contains("is-current")).toBe(true);
      expect(s.card("Lisbon").classList.contains("is-upcoming")).toBe(true);
      expect(s.card("Tuscany").classList.contains("is-past")).toBe(true);
    });

    it("shows dates, a badge and progress on the current trip", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const card = s.card("Japan 2026");
      expect(text(card.querySelector(".trip-planner-dates"))).toBe("Apr 1 – Apr 10, 2026");
      expect(text(card.querySelector(".trip-planner-badge"))).toBe("Day 3 of 10");
      expect(card.querySelector<HTMLElement>(".trip-planner-progress-fill")!.style.getPropertyValue("--trip-progress")).toBe("30%");
    });

    it("has no progress bar on trips that aren't current", async () => {
      const s = await setup([LISBON, TUSCANY]);
      await s.open();
      expect(s.root.querySelector(".trip-planner-progress")).toBeNull();
      expect(text(s.card("Lisbon").querySelector(".trip-planner-badge"))).toBe("Starts in 6 weeks");
      expect(text(s.card("Tuscany").querySelector(".trip-planner-badge"))).toBe("Completed");
    });

    it("lists quick links with their icons, today first", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const chips = [...s.card("Japan 2026").querySelectorAll(".trip-planner-chip")].map((c) => [text(c), c.querySelector(".trip-planner-icon")?.getAttribute("data-icon")]);
      expect(chips).toEqual([
        ["Today", "calendar-check"],
        ["Flights", "plane"],
        ["Hotels", "bed-double"],
        ["Transportation", "train-front"],
        ["Attractions", "landmark"],
        ["Tickets", "ticket"],
        ["Packing", "luggage"],
        ["Documents", "file-text"],
      ]);
    });

    it("lists the days, marks today, and opens the schedule only for the current trip", async () => {
      const s = await setup([JAPAN, LISBON]);
      await s.open();
      const current = s.card("Japan 2026").querySelector("details")!;
      expect(current.open).toBe(true);
      expect(text(current.querySelector("summary"))).toBe("Schedule · 10 days");
      const days = [...current.querySelectorAll(".trip-planner-day")];
      expect(days).toHaveLength(10);
      expect(text(days[0])).toBe("1Wed, Apr 1");
      const today = current.querySelectorAll(".trip-planner-day.is-today");
      expect(today).toHaveLength(1);
      expect(text(today[0])).toBe("3Fri, Apr 3");
      expect(s.card("Lisbon").querySelector("details")!.open).toBe(false);
    });

    it("says 'day' for a one-day trip", async () => {
      const s = await setup([draft("Day trip", "2026-06-01", "2026-06-01")]);
      await s.open();
      expect(text(s.root.querySelector("summary"))).toBe("Schedule · 1 day");
    });

    it("skips the schedule when a trip has no day notes", async () => {
      const s = await setup();
      s.vault.addNote("Areas/Hand/Overview.md", "---\ntype: trip\nname: Hand\nstart: 2026-07-01\nend: 2026-07-02\n---\n");
      await s.open();
      expect(s.card("Hand").querySelector("details")).toBeNull();
      expect(s.card("Hand").querySelector(".trip-planner-chip")).toBeNull(); // and no section links either
    });
  });

  describe("opening notes", () => {
    it("opens a trip's overview from its title", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      click(s.card("Japan 2026").querySelector(".trip-planner-trip-name")!);
      expect(s.workspace.opened).toEqual([{ path: "Trips/Japan 2026/Overview.md", newTab: false }]);
    });

    it("opens a chip's note, and a day's note", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      click(buttonLabelled(s.card("Japan 2026"), "Flights"));
      click(s.card("Japan 2026").querySelectorAll(".trip-planner-day")[1]);
      expect(s.workspace.opened.map((o) => o.path)).toEqual(["Trips/Japan 2026/Flights.md", "Trips/Japan 2026/Schedule/2026-04-02 Thu.md"]);
    });

    it("opens in a new tab with Ctrl-click, Cmd-click or middle-click, but not other buttons", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const title = s.card("Japan 2026").querySelector(".trip-planner-trip-name")!;
      click(title, { ctrlKey: true });
      click(title, { metaKey: true });
      title.dispatchEvent(new MouseEvent("auxclick", { button: 1 }));
      title.dispatchEvent(new MouseEvent("auxclick", { button: 2 })); // right button: ignored
      expect(s.workspace.opened.map((o) => o.newTab)).toEqual([true, true, true]);
    });
  });

  describe("agent guide", () => {
    it("is offered on the trips that own their folder, labelled for screen readers", async () => {
      const s = await setup([JAPAN]);
      s.vault.addNote("Areas/Trips/Rome.md", "---\ntype: trip\nname: Rome\nstart: 2026-07-01\nend: 2026-07-02\n---\n");
      await s.open();
      const button = s.card("Japan 2026").querySelector(".trip-planner-agent-guide")!;
      expect(button.getAttribute("aria-label")).toBe("Add agent guide to Japan 2026");
      expect(s.card("Rome").querySelector(".trip-planner-agent-guide")).toBeNull();
    });

    it("tells the user when the trip already has one", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      click(s.card("Japan 2026").querySelector(".trip-planner-agent-guide")!);
      await flush();
      expect(Notice.messages).toEqual(["Japan 2026 already has an AGENTS.md."]);
    });
  });

  describe("deleting", () => {
    it("offers delete only on trips that own their folder", async () => {
      const s = await setup([JAPAN]);
      s.vault.addNote("Areas/Trips/Rome.md", "---\ntype: trip\nname: Rome\nstart: 2026-07-01\nend: 2026-07-02\n---\n");
      s.vault.addNote("Areas/Trips/Paris.md", "---\ntype: trip\nname: Paris\nstart: 2026-08-01\nend: 2026-08-02\n---\n");
      await s.open();
      expect(s.card("Japan 2026").querySelector(".trip-planner-delete")).not.toBeNull();
      expect(s.card("Rome").querySelector(".trip-planner-delete")).toBeNull();
      expect(s.card("Paris").querySelector(".trip-planner-delete")).toBeNull();
    });

    it("labels the button for screen readers", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const button = s.card("Japan 2026").querySelector(".trip-planner-delete")!;
      expect(button.getAttribute("aria-label")).toBe("Delete Japan 2026");
      expect(button.getAttribute("data-icon")).toBe("trash-2");
    });

    it("asks first, naming the folder and its files, and deletes nothing yet", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      click(s.card("Japan 2026").querySelector(".trip-planner-delete")!);
      await flush();
      expect(Modal.open).toHaveLength(1);
      const modal = Modal.open[0];
      expect(text(modal.contentEl.querySelector(".trip-planner-warning strong"))).toBe("Warning: this will delete everything under Trips/Japan 2026");
      const files = s.vault.paths().filter((p) => p.startsWith("Trips/Japan 2026/")).length;
      expect(files).toBe(19); // overview + 7 sections + 10 days + AGENTS.md
      expect(text(modal.contentEl.querySelector(".trip-planner-warning p"))).toContain(`All ${files} files inside it will be deleted`);
      expect(s.vault.paths()).toHaveLength(files); // nothing deleted yet
    });

    it("cancelling leaves the trip", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      click(s.card("Japan 2026").querySelector(".trip-planner-delete")!);
      await flush();
      click(buttonLabelled(Modal.open[0].contentEl, "Cancel"));
      await flush();
      expect(s.cards()).toHaveLength(1);
      expect(s.vault.paths().some((p) => p.startsWith("Trips/Japan 2026/"))).toBe(true);
      expect(Notice.messages).toEqual([]);
    });

    it("confirming trashes the trip, says so and redraws without it", async () => {
      const s = await setup([JAPAN, LISBON]);
      await s.open();
      click(s.card("Japan 2026").querySelector(".trip-planner-delete")!);
      await flush();
      click(buttonLabelled(Modal.open[0].contentEl, "Delete trip"));
      await flush();
      expect(s.vault.paths().some((p) => p.startsWith("Trips/Japan 2026/"))).toBe(false);
      expect(s.vault.paths().some((p) => p.startsWith("Trips/Lisbon/"))).toBe(true);
      expect(Notice.messages).toEqual(["Moved Japan 2026 to the trash"]);
      expect(s.cards().map((c) => text(c.querySelector(".trip-planner-trip-name")))).toEqual(["Lisbon"]);
    });

    it("shows the reason when the delete is refused", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      click(s.card("Japan 2026").querySelector(".trip-planner-delete")!);
      await flush();
      vi.spyOn(s.controller, "delete").mockResolvedValue({ ok: false, error: "Nope." });
      click(buttonLabelled(Modal.open[0].contentEl, "Delete trip"));
      await flush();
      expect(Notice.messages).toEqual(["Nope."]);
    });
  });

  describe("staying up to date", () => {
    const refresh = async () => {
      vi.advanceTimersByTime(300);
      await flush();
    };

    it("listens for vault, metadata and workspace changes", async () => {
      const s = await setup();
      await s.open();
      expect(s.app.metadataEvents.count("changed")).toBe(1);
      expect(["create", "delete", "rename"].map((e) => s.app.vaultEvents.count(e))).toEqual([1, 1, 1]);
      expect(s.app.workspaceEvents.count("active-leaf-change")).toBe(1);
    });

    it("redraws when a trip note appears anywhere, after a short pause", async () => {
      const s = await setup();
      await s.open();
      expect(s.cards()).toHaveLength(0);
      s.vault.addNote("Elsewhere/Rome/Overview.md", "---\ntype: trip\nname: Rome\nstart: 2026-07-01\nend: 2026-07-02\n---\n");
      s.app.metadataEvents.emit("changed", { path: "Elsewhere/Rome/Overview.md" }, "", { frontmatter: { type: "trip" } });
      expect(s.cards()).toHaveLength(0); // not before the pause
      await refresh();
      expect(s.cards().map((c) => text(c.querySelector(".trip-planner-trip-name")))).toEqual(["Rome"]);
    });

    it("redraws once for a burst of changes", async () => {
      const s = await setup();
      await s.open();
      const dashboard = vi.spyOn(s.controller, "dashboard");
      for (let i = 0; i < 5; i++) s.app.metadataEvents.emit("changed", { path: "Trips/x.md" }, "", {});
      await refresh();
      expect(dashboard).toHaveBeenCalledTimes(1);
    });

    it("ignores notes that have nothing to do with trips", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const dashboard = vi.spyOn(s.controller, "dashboard");
      s.app.metadataEvents.emit("changed", { path: "Daily/today.md" }, "", { frontmatter: { type: "diary" } });
      s.app.vaultEvents.emit("create", { path: "Daily/new.md" });
      s.app.vaultEvents.emit("delete", { path: "Daily/old.md" });
      s.app.vaultEvents.emit("rename", { path: "Daily/b.md" }, "Daily/a.md");
      await refresh();
      expect(dashboard).not.toHaveBeenCalled();
    });

    it("redraws when files are created, deleted or renamed inside a trip", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const dashboard = vi.spyOn(s.controller, "dashboard");
      for (const [event, args] of [
        ["create", [{ path: "Trips/Japan 2026/Notes.md" }]],
        ["delete", [{ path: "Trips/Japan 2026/Notes.md" }]],
        ["rename", [{ path: "Daily/new.md" }, "Trips/Japan 2026/Old.md"]], // moved out of a trip: the old path counts
      ] as const) {
        s.app.vaultEvents.emit(event, ...args);
        await refresh();
      }
      expect(dashboard).toHaveBeenCalledTimes(3);
    });

    it("redraws when you come back to the view, but not when another view is activated", async () => {
      const s = await setup([JAPAN]);
      await s.open();
      const dashboard = vi.spyOn(s.controller, "dashboard");
      s.app.workspaceEvents.emit("active-leaf-change", new WorkspaceLeaf(s.app.asApp()));
      await refresh();
      expect(dashboard).not.toHaveBeenCalled();
      s.app.workspaceEvents.emit("active-leaf-change", s.leaf);
      await refresh();
      expect(dashboard).toHaveBeenCalledTimes(1);
    });

    it("moves 'today' on when the day changes", async () => {
      const app = new FakeObsidianApp();
      let today = "2026-04-03";
      const { controller } = await createTripContainer({
        vault: new InMemoryTripVaultRepository(),
        workspace: new InMemoryWorkspaceGateway(),
        settingsRepository: new InMemorySettingsRepository({ openOverviewAfterCreate: false }),
        clock: () => today,
      });
      await controller.create(JAPAN);
      const leaf = new WorkspaceLeaf(app.asApp());
      const view = new TripsView(leaf as never, controller, () => undefined);
      await view.onOpen();
      expect(text(view.contentEl.querySelector(".trip-planner-badge"))).toBe("Day 3 of 10");
      today = "2026-04-04";
      app.workspaceEvents.emit("active-leaf-change", leaf);
      await refresh();
      expect(text(view.contentEl.querySelector(".trip-planner-badge"))).toBe("Day 4 of 10");
    });

    it("lets only the newest read draw when reads finish out of order", async () => {
      const s = await setup([JAPAN]);
      const empty: DashboardView = { sections: [] };
      const real = await s.controller.dashboard();
      let first!: (v: DashboardView) => void;
      let second!: (v: DashboardView) => void;
      vi.spyOn(s.controller, "dashboard")
        .mockImplementationOnce(() => new Promise((r) => (first = r)))
        .mockImplementationOnce(() => new Promise((r) => (second = r)));

      const opening = s.open(); // read #1 starts
      s.app.metadataEvents.emit("changed", { path: "Trips/x.md" }, "", {});
      vi.advanceTimersByTime(300); // read #2 starts
      second(real); // the newer read finishes first…
      await flush();
      first(empty); // …then the older, stale one
      await opening;
      await flush();

      expect(s.cards()).toHaveLength(1); // the stale empty read did not wipe the trips
    });
  });
});
