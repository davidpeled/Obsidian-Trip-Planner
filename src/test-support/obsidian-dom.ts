/**
 * Obsidian adds helpers such as createEl, createDiv and empty to every HTMLElement. Tests that render UI run
 * in a DOM (happy-dom) without Obsidian, so this installs the same helpers. Import it for its side effect.
 */
interface DomInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
}

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

function createEl(this: HTMLElement, tag: string, info?: DomInfo | string): HTMLElement {
  const o: DomInfo = typeof info === "string" ? { cls: info } : (info ?? {});
  const el = this.ownerDocument.createElement(tag);
  if (o.cls) el.className = ([] as string[]).concat(o.cls).join(" ");
  if (o.text !== undefined) el.textContent = o.text;
  for (const [k, v] of Object.entries(o.attr ?? {})) if (v !== null && v !== false) el.setAttribute(k, v === true ? "" : String(v));
  this.appendChild(el);
  return el;
}

Object.assign(proto, {
  createEl,
  createDiv(this: HTMLElement, info?: DomInfo | string) {
    return createEl.call(this, "div", info);
  },
  createSpan(this: HTMLElement, info?: DomInfo | string) {
    return createEl.call(this, "span", info);
  },
  empty(this: HTMLElement) {
    this.replaceChildren();
  },
  addClass(this: HTMLElement, ...classes: string[]) {
    this.classList.add(...classes);
  },
  removeClass(this: HTMLElement, ...classes: string[]) {
    this.classList.remove(...classes);
  },
  toggleClass(this: HTMLElement, cls: string, on: boolean) {
    this.classList.toggle(cls, on);
  },
  setText(this: HTMLElement, text: string) {
    this.textContent = text;
  },
  setCssProps(this: HTMLElement, props: Record<string, string>) {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
  },
  hide(this: HTMLElement) {
    this.style.display = "none";
  },
  show(this: HTMLElement) {
    this.style.removeProperty("display");
  },
});
