import { describe, expect, it } from "vitest";
import { NOTE_TYPES, type VaultNote } from "../contracts/trip";
import { addDays, daysBetween, eachDay, formatDay, formatRange, parseIsoDate, weekday } from "./dates";
import { discoverTrips } from "./trip-discovery";
import { cleanTripName, planTrip, validateDraft } from "./trip-scaffold";

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(parseIsoDate("2026-04-01")).toBe("2026-04-01");
    expect(parseIsoDate(" 2026-04-01 ")).toBe("2026-04-01");
    for (const bad of ["2026-02-30", "2026-4-1", "", "tomorrow", "0099-01-01", 20260401, null]) expect(parseIsoDate(bad)).toBeNull();
  });

  it("does arithmetic across month, year and leap boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-04-02", "2026-04-01")).toBe(-1);
    expect(eachDay("2026-12-31", "2027-01-02")).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(eachDay("2026-04-02", "2026-04-01")).toEqual([]);
  });

  it("is not affected by daylight saving", () => {
    expect(eachDay("2026-03-07", "2026-03-10")).toHaveLength(4); // US DST starts 2026-03-08
    expect(eachDay("2026-10-24", "2026-10-27")).toHaveLength(4); // EU DST ends 2026-10-25
  });

  it("formats days and ranges", () => {
    expect(weekday("2026-04-01")).toBe("Wed");
    expect(formatDay("2026-04-01")).toBe("Wed, Apr 1");
    expect(formatRange("2026-04-01", "2026-04-10")).toBe("Apr 1 – Apr 10, 2026");
    expect(formatRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(formatRange("2026-04-01", "2026-04-01")).toBe("Apr 1, 2026");
  });
});

describe("trip scaffold", () => {
  const draft = { name: "Japan 2026", location: "Trips", start: "2026-04-01", end: "2026-04-03" };

  it("cleans names into safe folder names", () => {
    expect(cleanTripName('  Rome: "summer" / trip?  ')).toBe("Rome summer trip");
    expect(cleanTripName("a#b^c[d]e")).toBe("a b c d e");
    expect(cleanTripName("...")).toBe("");
  });

  it("explains why a draft is invalid", () => {
    expect(validateDraft(draft)).toBeNull();
    expect(validateDraft({ ...draft, name: " / " })).toMatch(/name/);
    expect(validateDraft({ ...draft, start: "" })).toMatch(/start/);
    expect(validateDraft({ ...draft, end: "nope" })).toMatch(/end/);
    expect(validateDraft({ ...draft, end: "2026-03-31" })).toMatch(/before/);
    expect(validateDraft({ ...draft, end: "2028-01-01" })).toMatch(/at most/);
    expect(validateDraft({ ...draft, end: "2027-03-31" })).toBeNull(); // exactly 365 days
  });

  it("refuses to plan an invalid draft", () => {
    expect(() => planTrip({ ...draft, name: "" })).toThrow();
  });

  it("lays out overview, flights, transportation and one note per day", () => {
    const plan = planTrip(draft);
    expect(plan.folder).toBe("Trips/Japan 2026");
    expect(plan.folders).toEqual([
      "Trips",
      "Trips/Japan 2026", "Trips/Japan 2026/Schedule",
      "Trips/Japan 2026/Hotels",
      "Trips/Japan 2026/Tickets",
      "Trips/Japan 2026/Packing",
      "Trips/Japan 2026/Documents",
    ]);
    expect(plan.notes.map((n) => n.path)).toEqual([
      "Trips/Japan 2026/Overview.md",
      "Trips/Japan 2026/Flights.md",
      "Trips/Japan 2026/Hotels/Index.md",
      "Trips/Japan 2026/Transportation.md",
      "Trips/Japan 2026/Attractions.md",
      "Trips/Japan 2026/Tickets/Index.md",
      "Trips/Japan 2026/Packing/Index.md",
      "Trips/Japan 2026/Documents/Index.md",
      "Trips/Japan 2026/Schedule/2026-04-01 Wed.md",
      "Trips/Japan 2026/Schedule/2026-04-02 Thu.md",
      "Trips/Japan 2026/Schedule/2026-04-03 Fri.md",
    ]);
  });

  it("links the notes together with full paths", () => {
    const [overview, , , , , , , , first, second] = planTrip(draft).notes.map((n) => n.content);
    expect(overview).toContain("[[Trips/Japan 2026/Flights|Flights]]");
    expect(overview).toContain("[[Trips/Japan 2026/Attractions|Attractions & monuments]]");
    for (const [path, label] of [["Hotels/Index", "Hotels"], ["Tickets/Index", "Tickets"], ["Packing/Index", "Packing"], ["Documents/Index", "Documents"]]) {
      expect(overview).toContain(`[[Trips/Japan 2026/${path}|${label}]]`);
    }
    expect(overview).toContain("[[Trips/Japan 2026/Schedule/2026-04-02 Thu|Day 2 · Thu, Apr 2]]");
    expect(first).not.toContain("Previous day");
    expect(first).toContain("[[Trips/Japan 2026/Schedule/2026-04-02 Thu|Next day]]");
    expect(second).toContain("[[Trips/Japan 2026/Schedule/2026-04-01 Wed|Previous day]]");
  });

  it("leaves room for emergency and embassy numbers in the overview", () => {
    const [overview] = planTrip(draft).notes;
    expect(overview.content).toContain("## Emergency and embassy");
    for (const row of ["Local emergency number", "Police", "Ambulance", "My embassy or consulate: phone", "My embassy or consulate: address", "Insurance emergency line"]) {
      expect(overview.content).toContain(`| ${row} |`);
    }
    expect(overview.content).toContain("[[Trips/Japan 2026/Documents/Index|Documents]]");
  });

  it("gives every folder an index note, so none is empty", () => {
    const plan = planTrip(draft);
    // Every folder the plan creates directly holds a note, except the parent location, which holds the trip.
    const [, ...own] = plan.folders;
    const empty = own.filter((f) => !plan.notes.some((n) => n.path.startsWith(`${f}/`) && !n.path.slice(f.length + 1).includes("/")));
    expect(empty).toEqual([]);
    for (const dir of ["Hotels", "Tickets", "Packing", "Documents"]) {
      expect(plan.notes.some((n) => n.path === `Trips/Japan 2026/${dir}/Index.md`)).toBe(true);
    }
  });

  it("works with the trips folder at the vault root", () => {
    expect(planTrip({ ...draft, location: "" }).folder).toBe("Japan 2026");
  });

  it("creates the trip in the chosen location, parents first", () => {
    const plan = planTrip({ ...draft, name: "UK-trip", location: " /Areas / /Trips/ " });
    expect(plan.folder).toBe("Areas/Trips/UK-trip");
    expect(plan.overviewPath).toBe("Areas/Trips/UK-trip/Overview.md");
    expect(plan.folders).toEqual(["Areas", "Areas/Trips", "Areas/Trips/UK-trip", "Areas/Trips/UK-trip/Schedule", ...["Hotels", "Tickets", "Packing", "Documents"].map((d) => `Areas/Trips/UK-trip/${d}`)]);
    expect(plan.notes.every((n) => n.path.startsWith("Areas/Trips/UK-trip/"))).toBe(true);
    expect(plan.notes[0].content).toContain("[[Areas/Trips/UK-trip/Flights|Flights]]");
  });

  it("rejects locations that can't be folders", () => {
    for (const location of ["a/../b", "..", "./x", ".obsidian/x", "Areas/.hidden", "a:b", "a|b", "a\\b", "a#b"]) expect(validateDraft({ ...draft, location }), location).toMatch(/location/);
    expect(validateDraft({ ...draft, location: "" })).toBeNull();
    expect(validateDraft({ ...draft, location: "Areas/Trips" })).toBeNull();
  });

  it("quotes names that YAML would misread", () => {
    const [overview] = planTrip({ ...draft, name: "Rome - 2026, part 1" }).notes;
    expect(overview.content).toContain('name: "Rome - 2026, part 1"');
  });
});

describe("trip discovery", () => {
  const note = (path: string, frontmatter: Record<string, unknown> | null): VaultNote => ({ path, frontmatter });
  const overview = (folder: string, start: unknown, end: unknown, name?: string) =>
    note(`${folder}/Overview.md`, { type: NOTE_TYPES.trip, start, end, ...(name ? { name } : {}) });

  it("finds trips with their notes and numbers the days", () => {
    const trips = discoverTrips(
      [
        overview("Trips/Japan", "2026-04-01", "2026-04-03", "Japan 2026"),
        note("Trips/Japan/Flights.md", { type: NOTE_TYPES.flights }),
        note("Trips/Japan/Transportation.md", { type: NOTE_TYPES.transportation }),
        note("Trips/Japan/Attractions.md", { type: NOTE_TYPES.attractions }),
        note("Trips/Japan/Tickets/Index.md", { type: NOTE_TYPES.tickets }),
        note("Trips/Japan/Hotels/Index.md", { type: NOTE_TYPES.hotels }),
        note("Trips/Japan/Packing/Index.md", { type: NOTE_TYPES.packing }),
        note("Trips/Japan/Documents/Index.md", { type: NOTE_TYPES.documents }),
        note("Trips/Japan/Schedule/b.md", { type: NOTE_TYPES.day, date: "2026-04-02" }),
        note("Trips/Japan/Schedule/a.md", { type: NOTE_TYPES.day, date: "2026-04-01" }),
        note("Trips/Japan/Schedule/bad.md", { type: NOTE_TYPES.day, date: "soon" }),
        note("Trips/Japan/Random.md", null),
        note("Trips/Other/Flights.md", { type: NOTE_TYPES.flights }),
      ],
      "2026-04-02"
    );
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      name: "Japan 2026",
      folder: "Trips/Japan",
      status: "current",
      sections: {
        flights: "Trips/Japan/Flights.md",
        hotels: "Trips/Japan/Hotels/Index.md",
        transportation: "Trips/Japan/Transportation.md",
        attractions: "Trips/Japan/Attractions.md",
        tickets: "Trips/Japan/Tickets/Index.md",
        packing: "Trips/Japan/Packing/Index.md",
        documents: "Trips/Japan/Documents/Index.md",
      },
    });
    expect(trips[0].days).toEqual([
      { date: "2026-04-01", number: 1, path: "Trips/Japan/Schedule/a.md" },
      { date: "2026-04-02", number: 2, path: "Trips/Japan/Schedule/b.md" },
    ]);
  });

  it("orders day notes with the same date by path, so the numbering is stable", () => {
    const [trip] = discoverTrips(
      [
        overview("T/x", "2026-04-01", "2026-04-02"),
        note("T/x/b.md", { type: NOTE_TYPES.day, date: "2026-04-01" }),
        note("T/x/a.md", { type: NOTE_TYPES.day, date: "2026-04-01" }),
        note("T/x/c.md", { type: NOTE_TYPES.day, date: "2026-04-02" }),
      ],
      "2026-01-01"
    );
    expect(trip.days.map((d) => [d.number, d.path])).toEqual([[1, "T/x/a.md"], [2, "T/x/b.md"], [3, "T/x/c.md"]]);
  });

  it("classifies trips against today, inclusive of both end days", () => {
    const at = (today: string) => discoverTrips([overview("T/x", "2026-04-01", "2026-04-03")], today)[0].status;
    expect(at("2026-03-31")).toBe("upcoming");
    expect(at("2026-04-01")).toBe("current");
    expect(at("2026-04-03")).toBe("current");
    expect(at("2026-04-04")).toBe("past");
  });

  it("is forgiving about hand-edited trips", () => {
    const trips = discoverTrips(
      [overview("T/no-start", undefined, "2026-04-03"), overview("T/no-end", "2026-04-01", undefined), overview("T/backwards", "2026-04-05", "2026-04-01")],
      "2026-01-01"
    );
    expect(trips.map((t) => [t.name, t.end])).toEqual([
      ["no-end", "2026-04-01"], // name falls back to the folder
      ["backwards", "2026-04-05"], // end before start: one-day trip
    ]);
  });

  it("keeps a nested trip's notes with the nested trip", () => {
    const trips = discoverTrips(
      [
        overview("T/A", "2026-04-01", "2026-04-02", "A"),
        note("T/A/Flights.md", { type: NOTE_TYPES.flights }),
        note("T/A/Schedule/a1.md", { type: NOTE_TYPES.day, date: "2026-04-01" }),
        note("T/A/Schedule/a2.md", { type: NOTE_TYPES.day, date: "2026-04-02" }),
        overview("T/A/B", "2026-06-01", "2026-06-01", "B"),
        note("T/A/B/Flights.md", { type: NOTE_TYPES.flights }),
        note("T/A/B/Schedule/b1.md", { type: NOTE_TYPES.day, date: "2026-06-01" }),
      ],
      "2026-01-01"
    );
    const [a, b] = ["A", "B"].map((name) => trips.find((t) => t.name === name)!);
    expect(a.days.map((d) => d.path)).toEqual(["T/A/Schedule/a1.md", "T/A/Schedule/a2.md"]);
    expect(a.sections.flights).toBe("T/A/Flights.md");
    expect(b.days.map((d) => d.path)).toEqual(["T/A/B/Schedule/b1.md"]);
    expect(b.sections.flights).toBe("T/A/B/Flights.md");
  });

  describe("who owns a folder (what delete may remove)", () => {
    const owns = (notes: VaultNote[]) => Object.fromEntries(discoverTrips(notes, "2026-01-01").map((t) => [t.name, t.ownsFolder]));
    const make = (path: string, name: string, start: unknown = "2026-04-01") =>
      note(path, { type: NOTE_TYPES.trip, name, start, end: "2026-04-02" });

    it("is true for a trip the plugin created, alone in its folder", () => {
      expect(owns([make("T/Japan/Overview.md", "Japan")])).toEqual({ Japan: true });
    });

    it("is false for hand-written trips sharing a folder, so a shared folder is never offered", () => {
      expect(owns([make("Areas/Trips/Japan.md", "Japan"), make("Areas/Trips/Rome.md", "Rome")])).toEqual({ Japan: false, Rome: false });
    });

    it("is false for a lone hand-written note that isn't an Overview.md", () => {
      expect(owns([make("Areas/Trips/Japan.md", "Japan")])).toEqual({ Japan: false });
    });

    it("is false at the vault root", () => {
      expect(owns([make("Overview.md", "Root")])).toEqual({ Root: false });
    });

    it("is false for a trip that contains another trip, and true for the inner one", () => {
      expect(owns([make("T/A/Overview.md", "A"), make("T/A/B/Overview.md", "B")])).toEqual({ A: false, B: true });
    });

    it("counts a trip note too broken to list, so it can't hide inside a folder that gets deleted", () => {
      expect(owns([make("T/A/Overview.md", "A"), make("T/A/B/Overview.md", "Broken", "not a date")])).toEqual({ A: false });
      expect(owns([make("T/A/Overview.md", "A"), make("T/A/Other.md", "Other", "")])).toEqual({ A: false });
    });
  });

  it("sorts by start date", () => {
    const trips = discoverTrips([overview("T/b", "2026-06-01", "2026-06-02"), overview("T/a", "2026-05-01", "2026-05-02")], "2026-01-01");
    expect(trips.map((t) => t.name)).toEqual(["a", "b"]);
  });
});
