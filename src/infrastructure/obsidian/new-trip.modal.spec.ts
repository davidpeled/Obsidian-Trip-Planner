// @vitest-environment happy-dom
import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTripContainer } from "../../bootstrap/container";
import { click, buttonLabelled, flush, setting, text, type } from "../../test-support/dom-helpers";
import { Modal, Notice } from "../../test-support/obsidian.stub";
import { InMemorySettingsRepository, InMemoryWorkspaceGateway } from "../in-memory/in-memory-adapters";
import { InMemoryTripVaultRepository } from "../in-memory/in-memory-trip-vault.repository";
import { FolderSuggest } from "./folder-suggest";
import { NewTripModal } from "./new-trip.modal";

vi.mock("./folder-suggest", () => ({ FolderSuggest: vi.fn() }));

async function open(saved: Record<string, unknown> | null = null) {
  const vault = new InMemoryTripVaultRepository();
  const workspace = new InMemoryWorkspaceGateway();
  const { controller } = await createTripContainer({ vault, workspace, settingsRepository: new InMemorySettingsRepository(saved), clock: () => "2026-04-02" });
  const modal = new NewTripModal({} as App, controller);
  document.body.appendChild(modal.contentEl);
  modal.open();
  const c = modal.contentEl;
  const input = (name: string) => setting(c, name).querySelector("input")!;
  return {
    vault,
    workspace,
    controller,
    modal,
    c,
    name: input("Name"),
    location: input("Location"),
    start: input("Start date"),
    end: input("End date"),
    preview: () => text(setting(c, "Location").querySelector(".setting-item-description")),
    error: () => c.querySelector<HTMLElement>(".trip-planner-error")!,
    create: () => buttonLabelled(c, "Create trip"),
  };
}

describe("NewTripModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Notice.messages.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    Modal.open.length = 0;
    document.body.replaceChildren();
  });

  it("starts with the default location, today, and a week-long trip", async () => {
    const m = await open({ defaultLocation: "Areas/Trips" });
    expect((m.modal as unknown as { title: string }).title).toBe("New trip");
    expect([m.name.value, m.location.value, m.start.value, m.end.value]).toEqual(["", "Areas/Trips", "2026-04-02", "2026-04-08"]);
    expect(m.start.type).toBe("date");
    expect(m.end.type).toBe("date");
  });

  it("focuses the name", async () => {
    const m = await open();
    vi.runAllTimers();
    expect(document.activeElement).toBe(m.name);
  });

  it("shows where the trip will be created, and keeps up as you type", async () => {
    const m = await open({ defaultLocation: "Areas/Trips" });
    expect(m.preview()).toBe("Creates Areas/Trips/…/. Folders that don't exist yet are created.");
    type(m.name, "UK-trip");
    expect(m.preview()).toContain("Creates Areas/Trips/UK-trip/.");
    type(m.location, " Projects // 2026 ");
    expect(m.preview()).toContain("Creates Projects/2026/UK-trip/.");
    type(m.name, 'a:b "c"');
    expect(m.preview()).toContain("Creates Projects/2026/a b c/.");
  });

  it("offers the vault's folders for the location, and uses the one picked", async () => {
    vi.mocked(FolderSuggest).mockClear();
    const m = await open();
    expect(FolderSuggest).toHaveBeenCalledTimes(1);
    const [, input, onPick] = vi.mocked(FolderSuggest).mock.calls[0];
    expect(input).toBe(m.location);
    onPick("Archive/Trips");
    expect(m.preview()).toContain("Creates Archive/Trips/…/.");
    type(m.name, "Rome");
    click(m.create());
    await flush();
    expect(m.vault.paths()).toContain("Archive/Trips/Rome/Overview.md");
  });

  describe("only new folders", () => {
    const warned = (m: Awaited<ReturnType<typeof open>>) => setting(m.c, "Location").querySelector(".setting-item-description")!.classList.contains("mod-warning");
    const taken = (m: Awaited<ReturnType<typeof open>>) => m.controller.create({ name: "Rome", location: "Trips", start: "2026-04-02", end: "2026-04-03" });

    it("warns as you type a name whose folder already exists, and blocks Create", async () => {
      const m = await open();
      await taken(m);
      type(m.name, "Rome");
      await flush();
      expect(m.preview()).toBe("Trips/Rome already exists. A new trip needs a folder that doesn't exist yet: pick another name or location.");
      expect(warned(m)).toBe(true);
      expect(m.create().hasAttribute("disabled")).toBe(true);
    });

    it("clears the warning and unblocks Create once the name is free", async () => {
      const m = await open();
      await taken(m);
      type(m.name, "Rome");
      await flush();
      type(m.name, "Rome 2");
      await flush();
      expect(m.preview()).toBe("Creates Trips/Rome 2/. Folders that don't exist yet are created.");
      expect(warned(m)).toBe(false);
      expect(m.create().hasAttribute("disabled")).toBe(false);
    });

    it("also catches a name that differs only in letter case", async () => {
      const m = await open();
      await taken(m);
      type(m.name, "rome");
      await flush();
      expect(warned(m)).toBe(true);
    });

    it("re-checks when the location changes", async () => {
      const m = await open();
      await taken(m);
      type(m.name, "Rome");
      await flush();
      expect(warned(m)).toBe(true);
      type(m.location, "Archive");
      await flush();
      expect(warned(m)).toBe(false);
      type(m.location, "Trips");
      await flush();
      expect(warned(m)).toBe(true);
    });

    it("says what is wrong with a location, too", async () => {
      const m = await open();
      type(m.name, "Rome");
      type(m.location, "Areas/.hidden");
      await flush();
      expect(m.preview()).toBe("The location can't contain folders that start with a dot.");
      expect(m.create().hasAttribute("disabled")).toBe(true);
    });

    it("doesn't nag before there's a name, and a location that doesn't exist yet is fine", async () => {
      const m = await open();
      type(m.location, "Brand/New/Place");
      await flush();
      expect(warned(m)).toBe(false);
      expect(m.create().hasAttribute("disabled")).toBe(false);
    });

    it("creates nothing while blocked, by button or by Enter", async () => {
      const m = await open();
      await taken(m);
      const create = vi.spyOn(m.controller, "create");
      type(m.name, "Rome");
      await flush();
      click(m.create());
      m.name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await flush();
      expect(create).not.toHaveBeenCalled();
      expect(Modal.open).toContain(m.modal);
    });

    it("trusts only the newest answer when replies arrive out of order", async () => {
      const m = await open();
      let slow!: (v: string | null) => void;
      let fast!: (v: string | null) => void;
      vi.spyOn(m.controller, "folderProblem")
        .mockImplementationOnce(() => new Promise((r) => (slow = r)))
        .mockImplementationOnce(() => new Promise((r) => (fast = r)));
      type(m.name, "Ro"); // asks #1
      type(m.name, "Rome"); // asks #2
      fast(null);
      await flush();
      slow("Trips/Ro already exists."); // the stale answer arrives last
      await flush();
      expect(warned(m)).toBe(false);
      expect(m.create().hasAttribute("disabled")).toBe(false);
    });
  });

  it("moves the end date along when the start passes it, and leaves it alone otherwise", async () => {
    const m = await open();
    type(m.start, "2026-04-05");
    expect(m.end.value).toBe("2026-04-08"); // still after the start
    type(m.start, "2026-04-20");
    expect(m.end.value).toBe("2026-04-20");
  });

  it("creates the trip where it was asked to, tells you, opens it and closes", async () => {
    const m = await open();
    type(m.name, "UK-trip");
    type(m.location, "Areas/Trips");
    type(m.start, "2026-04-02");
    type(m.end, "2026-04-04");
    click(m.create());
    await flush();

    expect(m.vault.paths()).toContain("Areas/Trips/UK-trip/Overview.md");
    expect(m.vault.paths().filter((p) => p.includes("/Schedule/"))).toHaveLength(3);
    expect(Notice.messages).toEqual(["Created UK-trip"]);
    expect(m.workspace.opened).toEqual([{ path: "Areas/Trips/UK-trip/Overview.md", newTab: false }]);
    expect(Modal.open).not.toContain(m.modal);
  });

  it("creates when you press Enter in the name field", async () => {
    const m = await open();
    type(m.name, "Rome");
    m.name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(m.vault.paths()).toContain("Trips/Rome/Overview.md");
  });

  it("ignores other keys", async () => {
    const m = await open();
    type(m.name, "Rome");
    m.name.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await flush();
    expect(m.vault.paths()).toEqual([]);
  });

  it("explains what's wrong and stays open", async () => {
    const m = await open();
    expect(m.error().hidden).toBe(true); // hidden until there's something to say
    click(m.create());
    await flush();
    expect(text(m.error())).toBe("Give the trip a name.");
    expect(m.error().hidden).toBe(false);
    expect(Modal.open).toContain(m.modal);
    expect(m.vault.paths()).toEqual([]);
  });

  it("reports a trip that already exists, and stays open", async () => {
    const m = await open();
    await m.controller.create({ name: "Rome", location: "Trips", start: "2026-04-02", end: "2026-04-03" });
    type(m.name, "Rome");
    click(m.create());
    await flush();
    expect(text(m.error())).toContain("already exists");
    expect(Modal.open).toContain(m.modal);
  });

  it("clears an error once you fix the form and succeed", async () => {
    const m = await open();
    click(m.create());
    await flush();
    type(m.name, "Rome");
    click(m.create());
    await flush();
    expect(m.vault.paths()).toContain("Trips/Rome/Overview.md");
    expect(Modal.open).not.toContain(m.modal);
  });

  it("creates only once when you click twice, and disables the button meanwhile", async () => {
    const m = await open();
    const create = vi.spyOn(m.controller, "create");
    type(m.name, "Rome");
    click(m.create());
    expect(m.create().hasAttribute("disabled")).toBe(true);
    click(m.create());
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(m.vault.paths().filter((p) => p.endsWith("Overview.md"))).toHaveLength(1);
  });

  it("enables the button again after a failure", async () => {
    const m = await open();
    click(m.create()); // no name
    await flush();
    expect(m.create().hasAttribute("disabled")).toBe(false);
  });

  it("empties itself when closed", async () => {
    const m = await open();
    m.modal.close();
    expect(m.c.childElementCount).toBe(0);
  });
});
