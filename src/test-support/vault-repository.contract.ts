import { describe, expect, it } from "vitest";
import { TRIP_NOTE_TYPES } from "../domain/contracts/trip";
import type { TripVaultRepository } from "../domain/interfaces/ports";
import { planTrip } from "../domain/model/trip-scaffold";

/** One vault under test: the repository plus ways to put notes in and see what is there, whatever backs it. */
export interface VaultHarness {
  repo: TripVaultRepository;
  addNote: (path: string, content: string) => void;
  files: () => string[];
  folders: () => string[];
}

const plan = planTrip({ name: "Japan", location: "Areas/Trips", start: "2026-04-01", end: "2026-04-02" });
const trip = (type: string) => `---\ntype: ${type}\n---\n`;

/** The behavior every TripVaultRepository must have; run against the in-memory twin and the Obsidian adapter. */
export function describeVaultRepository(name: string, make: () => VaultHarness): void {
  describe(`${name} (vault repository contract)`, () => {
    it("lists only notes of the asked-for types, with their frontmatter", async () => {
      const { repo, addNote } = make();
      addNote("a/Overview.md", "---\ntype: trip\nname: A\n---\n");
      addNote("b/Flights.md", trip("trip-flights"));
      addNote("b/Diary.md", trip("diary"));
      addNote("b/Plain.md", "no frontmatter");
      const found = await repo.listTypedNotes(TRIP_NOTE_TYPES);
      expect(found.map((n) => n.path).sort()).toEqual(["a/Overview.md", "b/Flights.md"]);
      expect(found.find((n) => n.path === "a/Overview.md")?.frontmatter).toMatchObject({ type: "trip", name: "A" });
    });

    it("finds files and folders whatever the letter case", async () => {
      const { repo, addNote } = make();
      addNote("Areas/Trips/UK-trip/Overview.md", "x");
      for (const path of ["Areas/Trips/UK-trip", "areas/trips/uk-trip", "AREAS", "Areas/Trips/UK-trip/overview.MD"]) {
        expect(await repo.exists(path), path).toBe(true);
      }
      for (const path of ["Areas/Trips/UK", "Areas/Trips/UK-trip2", "Other"]) expect(await repo.exists(path), path).toBe(false);
    });

    it("writes the plan, creating missing parent folders", async () => {
      const { repo, files, folders } = make();
      expect(await repo.exists(plan.folder)).toBe(false);
      await repo.write(plan);
      expect(await repo.exists(plan.folder)).toBe(true);
      expect(files()).toEqual(plan.notes.map((n) => n.path).sort());
      expect(folders()).toEqual(expect.arrayContaining(["Areas", "Areas/Trips", plan.folder]));
      expect((await repo.listTypedNotes(TRIP_NOTE_TYPES)).length).toBe(plan.notes.length);
    });

    it("is all or nothing: a clashing note rolls back what the call created, and only that", async () => {
      const { repo, addNote, files, folders } = make();
      const clash = plan.notes[3].path; // fails after three notes and the folders are made
      addNote(clash, "mine");
      const [filesBefore, foldersBefore] = [files(), folders()];

      await expect(repo.write(plan)).rejects.toThrow();

      expect(files()).toEqual(filesBefore); // my note survives, nothing else is left
      expect(folders()).toEqual(foldersBefore);
    });

    it("keeps folders that were already there when it rolls back", async () => {
      const { repo, addNote, folders } = make();
      addNote("Areas/Trips/keep.md", "x");
      addNote(plan.notes[2].path, "clash");
      await expect(repo.write(plan)).rejects.toThrow();
      expect(folders()).toEqual(expect.arrayContaining(["Areas", "Areas/Trips"]));
    });

    it("counts the files in a folder at any depth", async () => {
      const { repo, addNote } = make();
      addNote("T/a.md", "x");
      addNote("T/sub/b.pdf", "x");
      addNote("T/sub/deep/c.md", "x");
      addNote("Other/d.md", "x");
      expect(await repo.countFiles("T")).toBe(3);
      expect(await repo.countFiles("Missing")).toBe(0);
    });

    it("trashes a folder with everything in it, and nothing beside it", async () => {
      const { repo, addNote, files } = make();
      addNote("T/a.md", "x");
      addNote("T/sub/b.md", "x");
      addNote("Other/c.md", "x");
      await repo.trash("T");
      expect(files()).toEqual(["Other/c.md"]);
      expect(await repo.exists("T")).toBe(false);
    });

    it("never trashes the vault root", async () => {
      const { repo, addNote, files } = make();
      addNote("T/a.md", "x");
      for (const root of ["", "/", " "]) await expect(repo.trash(root), JSON.stringify(root)).rejects.toThrow(/root/);
      expect(files()).toEqual(["T/a.md"]);
    });
  });
}
