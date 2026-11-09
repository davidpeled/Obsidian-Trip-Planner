import { describe, expect, it } from "vitest";
import { InMemorySettingsRepository, InMemoryWorkspaceGateway } from "./in-memory-adapters";
import { InMemoryTripVaultRepository } from "./in-memory-trip-vault.repository";

describe("InMemorySettingsRepository", () => {
  it("starts empty or with what it's given, and keeps what is saved", async () => {
    expect(await new InMemorySettingsRepository().load()).toBeNull();
    const repo = new InMemorySettingsRepository({ a: 1 });
    expect(await repo.load()).toEqual({ a: 1 });
    await repo.save({ b: 2 });
    expect(await repo.load()).toEqual({ b: 2 });
  });
});

describe("InMemoryWorkspaceGateway", () => {
  it("records opened notes, defaulting to the current tab", async () => {
    const gateway = new InMemoryWorkspaceGateway();
    await gateway.openNote("a.md");
    await gateway.openNote("b.md", { newTab: true });
    await gateway.openNote("c.md", {});
    expect(gateway.opened).toEqual([
      { path: "a.md", newTab: false },
      { path: "b.md", newTab: true },
      { path: "c.md", newTab: false },
    ]);
  });
});

describe("InMemoryTripVaultRepository frontmatter", () => {
  it("reads numbers and quoted strings, and skips lines that aren't key: value", async () => {
    const vault = new InMemoryTripVaultRepository();
    vault.addNote("a.md", '---\ntype: trip-day\nno colon here\nday: 3\nname: "Rome: part 1"\n---\nbody');
    const [note] = await vault.listTypedNotes(["trip-day"]);
    expect(note.frontmatter).toEqual({ type: "trip-day", day: 3, name: "Rome: part 1" });
  });

  it("treats a note without frontmatter as untyped", async () => {
    const vault = new InMemoryTripVaultRepository();
    vault.addNote("a.md", "# just text");
    expect(await vault.listTypedNotes(["trip"])).toEqual([]);
  });
});
