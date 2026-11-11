import { describe, expect, it } from "vitest";
import { createTripContainer } from "../bootstrap/container";
import { InMemorySettingsRepository, InMemoryWorkspaceGateway } from "../infrastructure/in-memory/in-memory-adapters";
import { InMemoryTripVaultRepository } from "../infrastructure/in-memory/in-memory-trip-vault.repository";
import { sanitizeSettings } from "./services/settings.service";

async function setup(today = "2026-04-02", saved: Record<string, unknown> | null = null) {
  const vault = new InMemoryTripVaultRepository();
  const workspace = new InMemoryWorkspaceGateway();
  const settingsRepository = new InMemorySettingsRepository(saved);
  const container = await createTripContainer({ vault, workspace, settingsRepository, clock: () => today });
  return { ...container, vault, workspace, settingsRepository };
}

const japan = { name: "Japan 2026", location: "Trips", start: "2026-04-01", end: "2026-04-03" };

describe("settings", () => {
  it("falls back to defaults for missing or mistyped values", () => {
    expect(sanitizeSettings(null)).toEqual({ defaultLocation: "Trips", openOverviewAfterCreate: true });
    expect(sanitizeSettings({ defaultLocation: 5, openOverviewAfterCreate: "yes" })).toEqual({ defaultLocation: "Trips", openOverviewAfterCreate: true });
  });

  it("normalizes the folder path", () => {
    expect(sanitizeSettings({ defaultLocation: " /Travel//2026/ " }).defaultLocation).toBe("Travel/2026");
    expect(sanitizeSettings({ defaultLocation: "  " }).defaultLocation).toBe("Trips");
  });

  it("still reads the setting's old name", () => {
    expect(sanitizeSettings({ tripsFolder: "Old/Place" }).defaultLocation).toBe("Old/Place");
  });

  it("saves updates and tells subscribers", async () => {
    const { settings, settingsRepository } = await setup();
    let calls = 0;
    const off = settings.subscribe(() => calls++);
    await settings.update({ defaultLocation: "Travel" });
    off();
    await settings.update({ openOverviewAfterCreate: false });
    expect(calls).toBe(1);
    expect(settingsRepository.saved).toEqual({ defaultLocation: "Travel", openOverviewAfterCreate: false });
  });
});

describe("creating trips", () => {
  it("writes the structure and opens the overview", async () => {
    const { controller, vault, workspace } = await setup();
    expect(await controller.create(japan)).toEqual({ ok: true, overviewPath: "Trips/Japan 2026/Overview.md" });
    expect(vault.paths()).toHaveLength(12);
    expect(workspace.opened).toEqual([{ path: "Trips/Japan 2026/Overview.md", newTab: false }]);
  });

  it("doesn't open the overview when the setting is off", async () => {
    const { controller, workspace } = await setup("2026-04-02", { openOverviewAfterCreate: false });
    await controller.create(japan);
    expect(workspace.opened).toEqual([]);
  });

  it("creates the trip in the folder it was given", async () => {
    const { controller, vault } = await setup();
    const result = await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    expect(result).toEqual({ ok: true, overviewPath: "Areas/Trips/UK-trip/Overview.md" });
    expect(vault.paths().every((p) => p.startsWith("Areas/Trips/UK-trip/"))).toBe(true);
    expect(vault.paths()).toHaveLength(12);
  });

  it("offers the default location, and previews the folder", async () => {
    const { controller } = await setup("2026-04-02", { defaultLocation: "Travel" });
    expect(controller.defaultLocation()).toBe("Travel");
    expect(controller.folderFor("Areas/Trips", "UK-trip")).toBe("Areas/Trips/UK-trip");
  });

  it("lets two trips share a name in different locations", async () => {
    const { controller } = await setup();
    expect((await controller.create(japan)).ok).toBe(true);
    expect((await controller.create({ ...japan, location: "Archive" })).ok).toBe(true);
  });

  it("rejects bad drafts and existing trips without writing", async () => {
    const { controller, vault } = await setup();
    expect(await controller.create({ ...japan, name: "" })).toMatchObject({ ok: false });
    await controller.create(japan);
    const before = vault.paths();
    const again = await controller.create(japan);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toContain("already exists");
    expect(vault.paths()).toEqual(before);
  });
});

describe("adding an agent guide", () => {
  const olderTrip = (vault: InMemoryTripVaultRepository) => {
    vault.addNote("Trips/Japan 2026/Overview.md", "---\ntype: trip\nname: Japan 2026\nstart: 2026-04-01\nend: 2026-04-03\n---\n");
    vault.addNote("Trips/Japan 2026/Schedule/2026-04-01 Wed.md", "---\ntype: trip-day\ntrip: Japan 2026\ndate: 2026-04-01\n---\n");
  };

  it("writes AGENTS.md into a trip that has none, without touching its notes, and opens it", async () => {
    const { controller, vault, workspace } = await setup();
    olderTrip(vault);
    const before = vault.paths();

    expect(await controller.addAgentGuide("Trips/Japan 2026")).toEqual({ ok: true, path: "Trips/Japan 2026/AGENTS.md" });

    expect(vault.paths()).toEqual([...before, "Trips/Japan 2026/AGENTS.md"].sort());
    expect(workspace.opened.map((o) => o.path)).toEqual(["Trips/Japan 2026/AGENTS.md"]);
  });

  it("never overwrites an existing guide, whatever the letter case", async () => {
    const { controller, vault } = await setup();
    olderTrip(vault);
    vault.addNote("Trips/Japan 2026/agents.md", "mine");
    const result = await controller.addAgentGuide("Trips/Japan 2026");
    expect(result).toMatchObject({ ok: false });
    expect(vault.paths()).not.toContain("Trips/Japan 2026/AGENTS.md");
  });

  it("refuses a folder that isn't exactly one trip's own", async () => {
    const { controller, vault } = await setup();
    vault.addNote("Trips/Rome.md", "---\ntype: trip\nname: Rome\nstart: 2026-07-01\nend: 2026-07-02\n---\n");
    expect(await controller.addAgentGuide("Trips")).toMatchObject({ ok: false });
    expect(await controller.addAgentGuide("Nowhere")).toMatchObject({ ok: false });
    expect(vault.paths()).toEqual(["Trips/Rome.md"]);
  });
});

describe("deleting trips", () => {
  it("removes the trip's folder and nothing else", async () => {
    const { controller, vault } = await setup();
    await controller.create(japan);
    await controller.create({ ...japan, name: "Rome" });
    vault.addNote("Trips/Japan 2026/Tickets/flight.pdf.md", "a file I added");
    vault.addNote("Trips/Notes.md", "unrelated");

    expect(await controller.delete("Trips/Japan 2026")).toEqual({ ok: true });

    expect(vault.paths().some((p) => p.startsWith("Trips/Japan 2026/"))).toBe(false);
    expect(vault.paths()).toContain("Trips/Notes.md");
    expect(vault.paths().filter((p) => p.startsWith("Trips/Rome/"))).toHaveLength(12);
    const names = (await controller.dashboard()).sections.flatMap((s) => s.trips.map((t) => t.name));
    expect(names).toEqual(["Rome"]);
  });

  it("frees the name, so the trip can be created again", async () => {
    const { controller } = await setup();
    await controller.create(japan);
    await controller.delete("Trips/Japan 2026");
    expect((await controller.create(japan)).ok).toBe(true);
  });

  it("refuses any folder that isn't a trip", async () => {
    const { controller, vault } = await setup();
    await controller.create(japan);
    vault.addNote("Areas/Health/plan.md", "# not a trip");
    for (const folder of ["Areas/Health", "Areas", "Trips", "", "Trips/Japan 2026/Schedule", "Nowhere"]) {
      const result = await controller.delete(folder);
      expect(result.ok, folder).toBe(false);
    }
    expect(vault.paths()).toContain("Areas/Health/plan.md");
    expect(vault.paths()).toHaveLength(13);
  });

  describe("shared and nested folders", () => {
    const hand = (name: string) => `---\ntype: trip\nname: ${name}\nstart: 2026-04-01\nend: 2026-04-03\n---\n`;

    it("refuses to delete hand-written trips that share a folder, and keeps everything", async () => {
      const { controller, vault } = await setup();
      vault.addNote("Areas/Trips/Japan.md", hand("Japan"));
      vault.addNote("Areas/Trips/Rome.md", hand("Rome"));
      vault.addNote("Areas/Trips/Other notes.md", "unrelated");
      const cards = (await controller.dashboard()).sections.flatMap((s) => s.trips);
      expect(cards.map((c) => [c.name, c.deletable])).toEqual([["Japan", false], ["Rome", false]]);
      const before = vault.paths();

      const result = await controller.delete("Areas/Trips");
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toContain("shares its folder");
      expect(vault.paths()).toEqual(before);
    });

    it("refuses a trip note at the vault root", async () => {
      const { controller, vault } = await setup();
      vault.addNote("Overview.md", hand("Root"));
      vault.addNote("Daily/today.md", "keep me");
      const [card] = (await controller.dashboard()).sections.flatMap((s) => s.trips);
      expect(card.deletable).toBe(false);
      expect((await controller.delete(card.folder)).ok).toBe(false);
      expect(vault.paths()).toContain("Daily/today.md");
    });

    it("won't delete a trip that holds another trip, but can delete the inner one", async () => {
      const { controller, vault } = await setup();
      await controller.create({ ...japan, name: "A" });
      await controller.create({ ...japan, name: "B", location: "Trips/A" });
      const cards = (await controller.dashboard()).sections.flatMap((s) => s.trips);
      expect(cards.map((c) => [c.name, c.deletable])).toEqual([["A", false], ["B", true]]);
      expect((await controller.delete("Trips/A")).ok).toBe(false);
      expect((await controller.delete("Trips/A/B")).ok).toBe(true);
      expect(vault.paths().some((p) => p.startsWith("Trips/A/B/"))).toBe(false);
      expect((await controller.dashboard()).sections.flatMap((s) => s.trips).map((c) => [c.name, c.deletable])).toEqual([["A", true]]);
    });

    it("keeps each nested trip's own days", async () => {
      const { controller } = await setup();
      await controller.create({ ...japan, name: "A" }); // 3 days
      await controller.create({ ...japan, name: "B", location: "Trips/A", end: "2026-04-01" }); // 1 day
      const cards = (await controller.dashboard()).sections.flatMap((s) => s.trips);
      expect(Object.fromEntries(cards.map((c) => [c.name, c.days.length]))).toEqual({ A: 3, B: 1 });
    });
  });

  it("reports a failing trash as a result, and leaves the trip listed", async () => {
    class FailingTrash extends InMemoryTripVaultRepository {
      override trash(): Promise<void> {
        return Promise.reject(new Error("disk full"));
      }
    }
    const vault = new FailingTrash();
    const { controller } = await createTripContainer({ vault, workspace: new InMemoryWorkspaceGateway(), settingsRepository: new InMemorySettingsRepository(), clock: () => "2026-04-02" });
    await controller.create(japan);
    expect(await controller.delete("Trips/Japan 2026")).toEqual({ ok: false, error: "Couldn't delete the trip: disk full" });
    expect((await controller.dashboard()).sections).toHaveLength(1);
  });

  it("copes with a vault that rejects with something that isn't an Error", async () => {
    class Odd extends InMemoryTripVaultRepository {
      override write(): Promise<void> {
        return Promise.reject("quota exceeded"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- the point of the test
      }
      override trash(): Promise<void> {
        return Promise.reject("locked"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- the point of the test
      }
    }
    const container = await createTripContainer({ vault: new Odd(), workspace: new InMemoryWorkspaceGateway(), settingsRepository: new InMemorySettingsRepository(), clock: () => "2026-04-02" });
    expect(await container.controller.create(japan)).toEqual({ ok: false, error: "Couldn't create the trip: quota exceeded" });
    const vault = new Odd();
    vault.addNote("Trips/X/Overview.md", "---\ntype: trip\nname: X\nstart: 2026-05-01\nend: 2026-05-02\n---\n");
    const other = await createTripContainer({ vault, workspace: new InMemoryWorkspaceGateway(), settingsRepository: new InMemorySettingsRepository(), clock: () => "2026-04-02" });
    expect(await other.controller.delete("Trips/X")).toEqual({ ok: false, error: "Couldn't delete the trip: locked" });
  });

  it("gives today's date to whoever needs it", async () => {
    expect((await setup("2026-07-04")).controller.today()).toBe("2026-07-04");
  });

  it("counts the files that would go, so the confirmation can say so", async () => {
    const { controller, vault } = await setup();
    await controller.create(japan);
    expect(await controller.fileCount("Trips/Japan 2026")).toBe(12);
    vault.addNote("Trips/Japan 2026/Documents/passport.md", "x");
    expect(await controller.fileCount("Trips/Japan 2026")).toBe(13);
  });

  it("puts the folder on each card and notices its removal", async () => {
    const { controller } = await setup();
    await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    const [card] = (await controller.dashboard()).sections[0].trips;
    expect(card.folder).toBe("Areas/Trips/UK-trip");
    expect(controller.affects("Areas/Trips/UK-trip")).toBe(true); // the folder itself being deleted
  });
});

describe("only new folders", () => {
  it("explains why a folder can't be used, and has no complaint while the name is blank", async () => {
    const { controller } = await setup();
    await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    expect(await controller.folderProblem("Areas/Trips", "")).toBeNull();
    expect(await controller.folderProblem("Areas/Trips", "   ")).toBeNull();
    expect(await controller.folderProblem("Areas/Trips", "Rome")).toBeNull();
    expect(await controller.folderProblem("Areas/Trips", "UK-trip")).toBe(
      "Areas/Trips/UK-trip already exists. A new trip needs a folder that doesn't exist yet: pick another name or location."
    );
    expect(await controller.folderProblem("Areas/.hidden", "Rome")).toMatch(/dot/);
    expect(await controller.folderProblem("a|b", "Rome")).toMatch(/location/);
  });

  it("treats a differently-cased folder as the same one (macOS and Windows do)", async () => {
    const { controller, vault } = await setup();
    await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    const before = vault.paths();
    expect(await controller.folderProblem("areas/trips", "uk-TRIP")).toContain("already exists");
    expect((await controller.create({ ...japan, name: "uk-trip", location: "Areas/Trips" })).ok).toBe(false);
    expect(vault.paths()).toEqual(before);
  });

  it("refuses a folder that is already there even when it's empty or just a file's name", async () => {
    const { controller, vault } = await setup();
    await controller.create({ ...japan, name: "Rome" });
    await controller.delete("Trips/Rome"); // trashing leaves nothing; now plant an empty folder and a file
    await vault.write({ folder: "Trips/Empty", overviewPath: "", folders: ["Trips", "Trips/Empty"], notes: [] });
    vault.addNote("Trips/Paris", "a file called Paris");
    expect(await controller.folderProblem("Trips", "Empty")).toContain("already exists");
    expect(await controller.folderProblem("Trips", "Paris")).toContain("already exists");
    expect(await controller.folderProblem("Trips", "Rome")).toBeNull(); // deleted, so free again
  });

  it("creates in a location that doesn't exist yet", async () => {
    const { controller } = await setup();
    expect(await controller.folderProblem("Brand/New/Place", "Rome")).toBeNull();
    expect((await controller.create({ ...japan, name: "Rome", location: "Brand/New/Place" })).ok).toBe(true);
  });
});

describe("creating trips safely", () => {
  it("creates one trip when asked twice at once, and says why the second didn't", async () => {
    const { controller, vault } = await setup();
    const [first, second] = await Promise.all([controller.create(japan), controller.create(japan)]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(!second.ok && second.error).toContain("already exists");
    expect(vault.paths()).toHaveLength(12);
  });

  it("reports a write failure as a result, not an exception", async () => {
    class Failing extends InMemoryTripVaultRepository {
      override write(): Promise<void> {
        return Promise.reject(new Error("disk full"));
      }
    }
    const vault = new Failing();
    const container = await createTripContainer({ vault, workspace: new InMemoryWorkspaceGateway(), settingsRepository: new InMemorySettingsRepository(), clock: () => "2026-04-02" });
    const result = await container.controller.create(japan);
    expect(result).toEqual({ ok: false, error: "Couldn't create the trip: disk full" });
  });
});

describe("what should refresh the dashboard", () => {
  it("refreshes for a trip note anywhere in the vault, even one we don't show yet", async () => {
    const { controller } = await setup();
    expect(controller.affectsChange("Somewhere/else/Overview.md", { type: "trip" })).toBe(true);
    expect(controller.affectsChange("Anywhere/x.md", { type: "trip-day" })).toBe(true);
  });

  it("ignores other notes outside the trips we show", async () => {
    const { controller } = await setup();
    expect(controller.affectsChange("Daily/today.md", undefined)).toBe(false);
    expect(controller.affectsChange("Daily/today.md", { type: "diary" })).toBe(false);
    expect(controller.affectsChange("Daily/today.md", { type: 5 })).toBe(false);
  });

  it("still refreshes for any edit inside a shown trip or the default location", async () => {
    const { controller } = await setup();
    await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    await controller.dashboard();
    expect(controller.affectsChange("Areas/Trips/UK-trip/Packing/Index.md", undefined)).toBe(true);
    expect(controller.affectsChange("Trips/new.md", undefined)).toBe(true);
  });
});

describe("dashboard badges", () => {
  const badgeFor = async (today: string, start: string, end: string) => {
    const { controller } = await setup(today);
    await controller.create({ name: "T", location: "Trips", start, end });
    return (await controller.dashboard()).sections[0].trips[0].badge;
  };

  it("counts days up close, then weeks, then months", async () => {
    expect(await badgeFor("2026-04-01", "2026-04-10", "2026-04-12")).toBe("Starts in 9 days");
    expect(await badgeFor("2026-04-01", "2026-04-29", "2026-05-01")).toBe("Starts in 4 weeks");
    expect(await badgeFor("2026-04-01", "2026-09-01", "2026-09-05")).toBe("Starts in 5 months");
    expect(await badgeFor("2026-04-01", "2027-04-01", "2027-04-05")).toBe("Starts in 12 months");
  });

  it("says how recently a trip ended, then just that it's done", async () => {
    expect(await badgeFor("2026-04-05", "2026-04-01", "2026-04-04")).toBe("Ended yesterday");
    expect(await badgeFor("2026-04-09", "2026-04-01", "2026-04-04")).toBe("Ended 5 days ago");
    expect(await badgeFor("2026-04-20", "2026-04-01", "2026-04-04")).toBe("Completed");
  });
});

describe("dashboard", () => {
  it("is empty before any trip exists", async () => {
    const { controller } = await setup();
    expect(await controller.dashboard()).toEqual({ sections: [] });
  });

  it("finds trips wherever they were created", async () => {
    const { controller } = await setup();
    await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    await controller.create({ ...japan, name: "Rome", location: "" });
    await controller.create({ ...japan, name: "Paris", location: "Projects/2026/Travel" });
    const names = (await controller.dashboard()).sections.flatMap((s) => s.trips.map((t) => t.name));
    expect(names.sort()).toEqual(["Paris", "Rome", "UK-trip"]);
  });

  it("lists created trips, grouped by when they happen", async () => {
    const { controller } = await setup("2026-04-02");
    await controller.create({ name: "Last year", location: "Trips", start: "2025-04-01", end: "2025-04-02" });
    await controller.create({ name: "Older", location: "Trips", start: "2024-04-01", end: "2024-04-02" });
    await controller.create(japan);
    await controller.create({ name: "Soon", location: "Trips", start: "2026-04-03", end: "2026-04-05" });

    const { sections } = await controller.dashboard();
    expect(sections.map((s) => [s.id, s.trips.map((t) => t.name)])).toEqual([
      ["current", ["Japan 2026"]],
      ["upcoming", ["Soon"]],
      ["past", ["Last year", "Older"]], // most recent first
    ]);
    const [current, upcoming, past] = sections.map((s) => s.trips[0]);
    expect(current.badge).toBe("Day 2 of 3");
    expect(upcoming.badge).toBe("Starts tomorrow");
    expect(past.badge).toBe("Completed");
    expect(current.progress).toBeCloseTo(2 / 3);
    expect(upcoming.progress).toBeNull();
    expect(current.dateRange).toBe("Apr 1 – Apr 3, 2026");
  });

  it("links the trip's notes, with today's note first during the trip", async () => {
    const { controller } = await setup("2026-04-02");
    await controller.create(japan);
    const [card] = (await controller.dashboard()).sections[0].trips;
    expect(card.overview.path).toBe("Trips/Japan 2026/Overview.md");
    expect(card.quickLinks).toEqual([
      { kind: "today", label: "Today", path: "Trips/Japan 2026/Schedule/2026-04-02 Thu.md" },
      { kind: "flights", label: "Flights", path: "Trips/Japan 2026/Flights.md" },
      { kind: "hotels", label: "Hotels", path: "Trips/Japan 2026/Hotels/Index.md" },
      { kind: "transportation", label: "Transportation", path: "Trips/Japan 2026/Transportation.md" },
      { kind: "attractions", label: "Attractions", path: "Trips/Japan 2026/Attractions.md" },
      { kind: "tickets", label: "Tickets", path: "Trips/Japan 2026/Tickets/Index.md" },
      { kind: "packing", label: "Packing", path: "Trips/Japan 2026/Packing/Index.md" },
      { kind: "documents", label: "Documents", path: "Trips/Japan 2026/Documents/Index.md" },
    ]);
    expect(card.days.map((d) => [d.number, d.label, d.isToday])).toEqual([
      [1, "Wed, Apr 1", false],
      [2, "Thu, Apr 2", true],
      [3, "Fri, Apr 3", false],
    ]);
  });

  it("only links notes that still exist", async () => {
    const { controller, vault } = await setup("2026-01-01");
    await controller.create(japan);
    vault.addNote("Trips/Japan 2026/Flights.md", "no frontmatter now");
    const [card] = (await controller.dashboard()).sections[0].trips;
    expect(card.quickLinks.map((l) => l.label)).toEqual(["Hotels", "Transportation", "Attractions", "Tickets", "Packing", "Documents"]);
  });

  it("knows which paths can change it", async () => {
    const { controller, settings } = await setup();
    await controller.create({ ...japan, name: "UK-trip", location: "Areas/Trips" });
    await controller.dashboard();
    expect(controller.affects("Areas/Trips/UK-trip/Flights.md")).toBe(true); // a trip we show
    expect(controller.affects("Trips/anything.md")).toBe(true); // the default location
    expect(controller.affects("Daily/2026-04-01.md")).toBe(false);
    await settings.update({ defaultLocation: "Travel" });
    expect(controller.affects("Travel/x.md")).toBe(true);
    expect(controller.affects("Trips/x.md")).toBe(false);
  });

  it("opens notes, in a new tab on request", async () => {
    const { controller, workspace } = await setup();
    await controller.open("a.md");
    await controller.open("b.md", true);
    expect(workspace.opened).toEqual([
      { path: "a.md", newTab: false },
      { path: "b.md", newTab: true },
    ]);
  });
});
