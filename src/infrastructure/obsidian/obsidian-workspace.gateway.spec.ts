import { describe, expect, it } from "vitest";
import { FakeObsidianApp } from "../../test-support/fake-obsidian-app";
import { ObsidianWorkspaceGateway } from "./obsidian-workspace.gateway";

const make = () => {
  const app = new FakeObsidianApp();
  app.addNote("Trips/Japan/Overview.md", "x");
  return { app, gateway: new ObsidianWorkspaceGateway(app.asApp()) };
};

describe("ObsidianWorkspaceGateway", () => {
  it("opens a note in the current tab", async () => {
    const { app, gateway } = make();
    await gateway.openNote("Trips/Japan/Overview.md");
    expect(app.leafRequests).toEqual([false]);
    expect(app.leaves[0].opened.map((f) => f.path)).toEqual(["Trips/Japan/Overview.md"]);
  });

  it("opens it in a new tab when asked", async () => {
    const { app, gateway } = make();
    await gateway.openNote("Trips/Japan/Overview.md", { newTab: true });
    expect(app.leafRequests).toEqual(["tab"]);
    expect(app.leaves[0].opened).toHaveLength(1);
  });

  it("does nothing for a path that isn't a file", async () => {
    const { app, gateway } = make();
    await gateway.openNote("Trips/Missing.md");
    await gateway.openNote("Trips/Japan"); // a folder
    expect(app.leafRequests).toEqual([]);
  });
});
