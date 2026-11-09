// @vitest-environment happy-dom
import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonLabelled, click, text } from "../../test-support/dom-helpers";
import { ConfirmDeleteModal } from "./confirm-delete.modal";

const open = (trip = { name: "UK-trip", folder: "Areas/Trips/UK-trip", fileCount: 11 }) => {
  const onConfirm = vi.fn();
  const modal = new ConfirmDeleteModal({} as App, trip, onConfirm);
  document.body.appendChild(modal.contentEl); // attached, so focus can be checked
  modal.open();
  return { modal, onConfirm, content: modal.contentEl };
};

describe("ConfirmDeleteModal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const warning = (content: HTMLElement) => content.querySelector<HTMLElement>(".trip-planner-warning")!;

  it("asks about the trip by name", () => {
    expect((open().modal as unknown as { title: string }).title).toBe("Delete UK-trip?");
  });

  it("warns, prominently, that everything under the folder will be deleted", () => {
    const w = warning(open().content);
    expect(w.getAttribute("role")).toBe("alert");
    expect(text(w.querySelector("strong"))).toBe("Warning: this will delete everything under Areas/Trips/UK-trip");
    expect(text(w.querySelector("p"))).toBe("All 11 files inside it will be deleted, including anything you added yourself: notes, tickets, PDFs and documents.");
  });

  it("says how many files go: one, none, many", () => {
    expect(text(warning(open({ name: "T", folder: "T", fileCount: 1 }).content).querySelector("p"))).toMatch(/^The 1 file inside it/);
    expect(text(warning(open({ name: "T", folder: "T", fileCount: 0 }).content).querySelector("p"))).toBe("The folder has no files in it.");
    expect(text(warning(open({ name: "T", folder: "T", fileCount: 250 }).content).querySelector("p"))).toMatch(/^All 250 files/);
  });

  it("says where it goes: the trash, following Obsidian's setting", () => {
    expect(text(open().content.querySelector(".setting-item-description"))).toBe('It is moved to the trash, following the "Deleted files" setting in Obsidian.');
  });

  it("puts the focus on Cancel, so Enter can't delete by accident", () => {
    const { content } = open();
    vi.runAllTimers();
    expect(document.activeElement).toBe(buttonLabelled(content, "Cancel"));
  });

  it("marks the delete button as a warning", () => {
    expect(buttonLabelled(open().content, "Delete trip").classList.contains("mod-warning")).toBe(true);
  });

  it("Cancel closes without deleting", () => {
    const { content, onConfirm } = open();
    click(buttonLabelled(content, "Cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(content.childElementCount).toBe(0); // closed: onClose emptied it
  });

  it("Delete closes and confirms exactly once", () => {
    const { content, onConfirm } = open();
    click(buttonLabelled(content, "Delete trip"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(content.childElementCount).toBe(0);
  });
});
