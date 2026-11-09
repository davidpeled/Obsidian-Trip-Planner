/**
 * Obsidian adds helpers to every HTMLElement (createEl, createDiv, empty, ...) and global createEl/createDiv/
 * createSpan functions. Tests that render UI run in a DOM (happy-dom) without Obsidian, so this installs the same
 * helpers. Importing it is safe anywhere: without a DOM it does nothing.
 */
interface DomInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
}

const XHTML = "http://www.w3.org/1999/xhtml";

/**
 * Makes the element. This is what Obsidian's own `createEl` is built on (and what the `prefer-create-el` rule tells
 * everything else to use instead), so it creates elements the standard way, in the HTML namespace.
 */
const makeElement = (doc: Document, tag: string): HTMLElement => doc.createElementNS(XHTML, tag);

function build(doc: Document, tag: string, info?: DomInfo | string): HTMLElement {
  const o: DomInfo = typeof info === "string" ? { cls: info } : (info ?? {});
  const el = makeElement(doc, tag);
  if (o.cls) el.className = ([] as string[]).concat(o.cls).join(" ");
  if (o.text !== undefined) el.textContent = o.text;
  for (const [k, v] of Object.entries(o.attr ?? {})) if (v !== null && v !== false) el.setAttribute(k, v === true ? "" : String(v));
  return el;
}

if (typeof HTMLElement !== "undefined") {
  const child = (parent: HTMLElement, tag: string, info?: DomInfo | string): HTMLElement => parent.appendChild(build(parent.ownerDocument, tag, info));

  Object.assign(HTMLElement.prototype, {
    createEl(this: HTMLElement, tag: string, info?: DomInfo | string) {
      return child(this, tag, info);
    },
    createDiv(this: HTMLElement, info?: DomInfo | string) {
      return child(this, "div", info);
    },
    createSpan(this: HTMLElement, info?: DomInfo | string) {
      return child(this, "span", info);
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
      this.hidden = true;
    },
    show(this: HTMLElement) {
      this.hidden = false;
    },
  });

  // Obsidian's global helpers make a detached element.
  Object.assign(globalThis, {
    createEl: (tag: string, info?: DomInfo | string) => build(document, tag, info),
    createDiv: (info?: DomInfo | string) => build(document, "div", info),
    createSpan: (info?: DomInfo | string) => build(document, "span", info),
  });
}
