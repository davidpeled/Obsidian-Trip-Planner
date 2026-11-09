// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import "../../test-support/dom-helpers";
import { FakeObsidianApp } from "../../test-support/fake-obsidian-app";
import { FolderSuggest } from "./folder-suggest";

const make = () => {
  const app = new FakeObsidianApp();
  ["Areas/Trips/Japan/a.md", "Areas/Health/b.md", "Projects/trips-2026/c.md", "Archive/d.md"].forEach((p) => app.addNote(p, "x"));
  const input = document.createElement("input");
  const onPick = vi.fn();
  const suggest = new FolderSuggest(app.asApp(), input, onPick);
  return { app, input, onPick, suggest, ask: (q: string) => suggest["getSuggestions"](q).map((f) => f.path) };
};

describe("FolderSuggest", () => {
  it("suggests folders that contain what you typed, ignoring case, shortest first", () => {
    expect(make().ask("TRIPS")).toEqual(["Areas/Trips", "Areas/Trips/Japan", "Projects/trips-2026"]);
  });

  it("suggests every folder, including the vault root, for an empty query", () => {
    const paths = make().ask("");
    expect(paths[0]).toBe("/");
    expect(paths).toEqual(expect.arrayContaining(["Areas", "Areas/Trips", "Archive", "Projects"]));
  });

  it("ignores spaces around the query and suggests nothing when nothing matches", () => {
    const { ask } = make();
    expect(ask("  health ")).toEqual(["Areas/Health"]);
    expect(ask("zzz")).toEqual([]);
  });

  it("shows at most 50", () => {
    const { app, ask } = make();
    for (let i = 0; i < 60; i++) app.addNote(`Many/f${i}/x.md`, "x");
    expect(ask("many")).toHaveLength(50);
  });

  it("renders a suggestion as its path", () => {
    const { app, suggest } = make();
    const el = document.createElement("div");
    suggest.renderSuggestion(app.vault.getFolderByPath("Areas/Trips") as never, el);
    expect(el.textContent).toBe("Areas/Trips");
  });

  it("puts the picked folder in the field, reports it and closes", () => {
    const { app, input, onPick, suggest } = make();
    suggest.selectSuggestion(app.vault.getFolderByPath("Areas/Health") as never);
    expect(input.value).toBe("Areas/Health");
    expect(onPick).toHaveBeenCalledWith("Areas/Health");
    expect((suggest as unknown as { closed: boolean }).closed).toBe(true);
  });
});
