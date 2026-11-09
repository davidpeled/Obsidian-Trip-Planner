import { describe, expect, it } from "vitest";
import type { Trip } from "../../domain/contracts/trip";
import { toDashboard } from "./dashboard.mapper";

const TODAY = "2026-04-10";

const trip = (over: Partial<Trip> & Pick<Trip, "name" | "start" | "end">): Trip => ({
  folder: `T/${over.name}`,
  overviewPath: `T/${over.name}/Overview.md`,
  status: "upcoming",
  ownsFolder: true,
  sections: {},
  days: [],
  ...over,
});

const only = (t: Trip) => toDashboard([t], TODAY).sections[0].trips[0];

describe("toDashboard", () => {
  it("has no sections without trips, and leaves out empty ones", () => {
    expect(toDashboard([], TODAY)).toEqual({ sections: [] });
    const view = toDashboard([trip({ name: "Soon", start: "2026-05-01", end: "2026-05-02" })], TODAY);
    expect(view.sections.map((s) => [s.id, s.title])).toEqual([["upcoming", "Upcoming"]]);
  });

  it("orders sections happening now, upcoming, past; upcoming soonest first, past latest first", () => {
    const view = toDashboard(
      [
        trip({ name: "Old", start: "2025-01-01", end: "2025-01-02", status: "past" }),
        trip({ name: "Recent", start: "2026-03-01", end: "2026-03-02", status: "past" }),
        trip({ name: "Now", start: "2026-04-09", end: "2026-04-12", status: "current" }),
        trip({ name: "Later", start: "2026-08-01", end: "2026-08-02" }),
        trip({ name: "Soon", start: "2026-05-01", end: "2026-05-02" }),
      ].sort((a, b) => a.start.localeCompare(b.start)), // as discovery sorts them
      TODAY
    );
    expect(view.sections.map((s) => [s.id, s.trips.map((t) => t.name)])).toEqual([
      ["current", ["Now"]],
      ["upcoming", ["Soon", "Later"]],
      ["past", ["Recent", "Old"]],
    ]);
  });

  it("carries the folder and whether the trip may be deleted", () => {
    expect(only(trip({ name: "A", start: "2026-05-01", end: "2026-05-02" }))).toMatchObject({ folder: "T/A", deletable: true });
    expect(only(trip({ name: "B", start: "2026-05-01", end: "2026-05-02", ownsFolder: false })).deletable).toBe(false);
  });

  it("formats the date range", () => {
    expect(only(trip({ name: "A", start: "2026-12-28", end: "2027-01-03" })).dateRange).toBe("Dec 28, 2026 – Jan 3, 2027");
  });

  describe("badge and progress", () => {
    const badge = (t: Partial<Trip> & Pick<Trip, "start" | "end">) => only(trip({ name: "X", ...t })).badge;

    it("shows the day of a current trip and how far through it we are", () => {
      const card = only(trip({ name: "Now", start: "2026-04-09", end: "2026-04-12", status: "current" }));
      expect(card.badge).toBe("Day 2 of 4");
      expect(card.progress).toBe(0.5);
      expect(only(trip({ name: "Last", start: "2026-04-07", end: "2026-04-10", status: "current" })).progress).toBe(1);
    });

    it("has no progress unless the trip is current", () => {
      expect(only(trip({ name: "A", start: "2026-05-01", end: "2026-05-02" })).progress).toBeNull();
      expect(only(trip({ name: "B", start: "2026-01-01", end: "2026-01-02", status: "past" })).progress).toBeNull();
    });

    it("counts down: tomorrow, days, weeks, months", () => {
      expect(badge({ start: "2026-04-11", end: "2026-04-12" })).toBe("Starts tomorrow");
      expect(badge({ start: "2026-04-24", end: "2026-04-25" })).toBe("Starts in 14 days");
      expect(badge({ start: "2026-04-25", end: "2026-04-26" })).toBe("Starts in 2 weeks");
      expect(badge({ start: "2026-05-30", end: "2026-05-31" })).toBe("Starts in 7 weeks");
      expect(badge({ start: "2026-06-09", end: "2026-06-10" })).toBe("Starts in 2 months");
      expect(badge({ start: "2027-04-10", end: "2027-04-11" })).toBe("Starts in 12 months");
    });

    it("says how recently a past trip ended, then just completed", () => {
      const past = (end: string) => badge({ start: "2026-03-01", end, status: "past" });
      expect(past("2026-04-09")).toBe("Ended yesterday");
      expect(past("2026-04-03")).toBe("Ended 7 days ago");
      expect(past("2026-04-02")).toBe("Completed");
    });
  });

  describe("quick links and days", () => {
    const full = trip({
      name: "Full",
      start: "2026-04-09",
      end: "2026-04-11",
      status: "current",
      sections: { documents: "d", flights: "f", tickets: "t", hotels: "h", packing: "p", attractions: "a", transportation: "tr" },
      days: [
        { date: "2026-04-09", number: 1, path: "d1" },
        { date: "2026-04-10", number: 2, path: "d2" },
        { date: "2026-04-11", number: 3, path: "d3" },
      ],
    });

    it("lists today's note first, then the sections in a fixed order, whatever order they were found in", () => {
      expect(only(full).quickLinks.map((l) => [l.kind, l.label, l.path])).toEqual([
        ["today", "Today", "d2"],
        ["flights", "Flights", "f"],
        ["hotels", "Hotels", "h"],
        ["transportation", "Transportation", "tr"],
        ["attractions", "Attractions", "a"],
        ["tickets", "Tickets", "t"],
        ["packing", "Packing", "p"],
        ["documents", "Documents", "d"],
      ]);
    });

    it("has no Today link outside the trip, or when today has no note", () => {
      expect(only({ ...full, status: "upcoming" }).quickLinks.some((l) => l.kind === "today")).toBe(false);
      expect(only({ ...full, days: full.days.filter((d) => d.number !== 2) }).quickLinks.some((l) => l.kind === "today")).toBe(false);
    });

    it("only links sections that exist", () => {
      expect(only({ ...full, sections: { flights: "f" } }).quickLinks.map((l) => l.label)).toEqual(["Today", "Flights"]);
    });

    it("labels the days and marks today", () => {
      expect(only(full).days.map((d) => [d.number, d.label, d.isToday])).toEqual([
        [1, "Thu, Apr 9", false],
        [2, "Fri, Apr 10", true],
        [3, "Sat, Apr 11", false],
      ]);
    });

    it("links the overview", () => {
      expect(only(full).overview).toEqual({ kind: "overview", label: "Overview", path: "T/Full/Overview.md" });
    });
  });
});
