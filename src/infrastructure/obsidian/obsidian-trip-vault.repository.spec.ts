import { describe, expect, it } from "vitest";
import { planTrip } from "../../domain/model/trip-scaffold";
import { FakeObsidianApp } from "../../test-support/fake-obsidian-app";
import { describeVaultRepository } from "../../test-support/vault-repository.contract";
import { ObsidianTripVaultRepository } from "./obsidian-trip-vault.repository";

describeVaultRepository("ObsidianTripVaultRepository", () => {
  const app = new FakeObsidianApp();
  return {
    repo: new ObsidianTripVaultRepository(app.asApp()),
    addNote: (p, c) => app.addNote(p, c),
    files: () => app.filePaths(),
    folders: () => app.folderPaths(),
  };
});

describe("ObsidianTripVaultRepository rollback", () => {
  const plan = planTrip({ name: "Japan", location: "Trips", start: "2026-04-01", end: "2026-04-02" });

  it("still reports the original error when cleaning up fails too", async () => {
    const app = new FakeObsidianApp();
    app.addNote(plan.notes[3].path, "clash");
    app.fileManager.trashFile = () => Promise.reject(new Error("trash is broken"));
    const repo = new ObsidianTripVaultRepository(app.asApp());
    await expect(repo.write(plan)).rejects.toThrow("File already exists.");
  });

  it("removes what it made through the user's deletion setting (trashFile), newest first", async () => {
    const app = new FakeObsidianApp();
    app.addNote(plan.notes[3].path, "clash");
    const trashed: string[] = [];
    const trash = app.fileManager.trashFile;
    app.fileManager.trashFile = (file) => (trashed.push(file.path), trash(file));
    await expect(new ObsidianTripVaultRepository(app.asApp()).write(plan)).rejects.toThrow();
    expect(trashed.slice(0, 3)).toEqual([plan.notes[2].path, plan.notes[1].path, plan.notes[0].path]); // files before their folders
    expect(trashed.every((p) => p !== plan.notes[3].path)).toBe(true); // never the note that was already there
  });

  it("trashes through Obsidian, so the user's deletion setting applies", async () => {
    const app = new FakeObsidianApp();
    app.addNote("T/a.md", "x");
    const trashed: string[] = [];
    const trash = app.fileManager.trashFile;
    app.fileManager.trashFile = (file) => (trashed.push(file.path), trash(file));
    await new ObsidianTripVaultRepository(app.asApp()).trash("T");
    expect(trashed).toEqual(["T"]);
  });

  it("quietly ignores a folder that is already gone", async () => {
    await expect(new ObsidianTripVaultRepository(new FakeObsidianApp().asApp()).trash("Missing")).resolves.toBeUndefined();
  });
});
