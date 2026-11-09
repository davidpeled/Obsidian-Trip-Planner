import "./obsidian-dom";

/** Type into an input the way a user does: set the value, then fire `input`. */
export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export const click = (el: Element, init: MouseEventInit = {}): void => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));

/** The setting row whose name is `name`. */
export function setting(container: HTMLElement, name: string): HTMLElement {
  const row = [...container.querySelectorAll<HTMLElement>(".setting-item")].find((r) => r.querySelector(".setting-item-name")?.textContent === name);
  if (!row) throw new Error(`No setting called "${name}"`);
  return row;
}

export const text = (el: Element | null | undefined): string => el?.textContent?.trim() ?? "";

export const buttonLabelled = (container: ParentNode, label: string): HTMLButtonElement => {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`No button labelled "${label}"`);
  return button;
};

/** Let queued promise callbacks run (a few microtask turns). */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
