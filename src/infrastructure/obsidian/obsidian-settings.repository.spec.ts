import type { Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { Plugin as StubPlugin } from "../../test-support/obsidian.stub";
import { ObsidianSettingsRepository } from "./obsidian-settings.repository";

const make = (data: unknown) => {
  const plugin = new StubPlugin({});
  plugin.data = data;
  return { plugin, repo: new ObsidianSettingsRepository(plugin as unknown as Plugin) };
};

describe("ObsidianSettingsRepository", () => {
  it("loads the saved object", async () => {
    expect(await make({ defaultLocation: "Travel" }).repo.load()).toEqual({ defaultLocation: "Travel" });
  });

  it("loads null when nothing usable was saved", async () => {
    for (const data of [null, undefined, "text", 5, true, ["a", "b"]]) expect(await make(data).repo.load(), String(data)).toBeNull();
  });

  it("saves through the plugin's data.json", async () => {
    const { plugin, repo } = make(null);
    await repo.save({ defaultLocation: "X", openOverviewAfterCreate: false });
    expect(plugin.data).toEqual({ defaultLocation: "X", openOverviewAfterCreate: false });
    expect(await repo.load()).toEqual({ defaultLocation: "X", openOverviewAfterCreate: false });
  });
});
