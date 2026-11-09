/**
 * Runtime stand-in for the `obsidian` package in tests (see vitest.config.ts): only what the plugin imports,
 * with the behavior it relies on. UI classes need a DOM (use `// @vitest-environment happy-dom` and import
 * `./obsidian-dom`). `FakeObsidianApp` builds on these.
 */
import "./obsidian-dom"; // Obsidian's global createEl/createDiv, used below

export class App {}

export class TAbstractFile {
  constructor(public path: string) {}
}

export class TFile extends TAbstractFile {
  content = "";
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return this.path === "/";
  }
}

export class Vault {
  static recurseChildren(root: TAbstractFile, callback: (file: TAbstractFile) => unknown): void {
    callback(root);
    if (root instanceof TFolder) root.children.forEach((child) => Vault.recurseChildren(child, callback));
  }
}

/** Like Obsidian's: no leading or trailing slash, one slash between parts, and "/" for the vault root. */
export function normalizePath(path: string): string {
  return path.replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "") || "/";
}

/** Trailing-edge debounce, as Obsidian's (`resetTimer` restarts the wait on every call). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, timeout = 0, resetTimer = false): (...args: A) => void {
  let timer: number | null = null;
  return (...args: A) => {
    if (timer !== null && !resetTimer) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, timeout);
  };
}

/** Records which icon went where, instead of drawing it. */
export function setIcon(el: HTMLElement, name: string): void {
  el.setAttribute("data-icon", name);
}

/** Every Notice shown, oldest first. Tests read and clear it. */
export class Notice {
  static messages: string[] = [];
  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export class WorkspaceLeaf {
  opened: TFile[] = [];
  viewState: { type?: string; active?: boolean } | null = null;
  constructor(public app: App) {}
  openFile(file: TFile): Promise<void> {
    this.opened.push(file);
    return Promise.resolve();
  }
  setViewState(state: { type?: string; active?: boolean }): Promise<void> {
    this.viewState = state;
    return Promise.resolve();
  }
}

export class ItemView {
  app: App;
  contentEl: HTMLElement = createDiv();
  navigation = true;
  /** Event refs and cleanups the view registered, so tests can see what it subscribed to. */
  registered: unknown[] = [];
  cleanups: (() => void)[] = [];
  constructor(public leaf: WorkspaceLeaf) {
    this.app = leaf.app;
  }
  registerEvent(ref: unknown): void {
    this.registered.push(ref);
  }
  register(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }
}

export class Modal {
  /** Every modal that is currently open, newest last. */
  static open: Modal[] = [];
  contentEl: HTMLElement = createDiv();
  title = "";
  constructor(public app: App) {}
  open(): void {
    Modal.open.push(this);
    this.onOpen();
  }
  close(): void {
    if (!Modal.open.includes(this)) return;
    Modal.open = Modal.open.filter((m) => m !== this);
    this.onClose();
  }
  setTitle(title: string): this {
    this.title = title;
    return this;
  }
  onOpen(): void {}
  onClose(): void {}
}

class TextComponent {
  inputEl = createEl("input");
  constructor(containerEl: HTMLElement) {
    containerEl.appendChild(this.inputEl);
  }
  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }
  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }
  /** Fires on every input event, as in Obsidian. */
  onChange(callback: (value: string) => unknown): this {
    this.inputEl.addEventListener("input", () => void callback(this.inputEl.value));
    return this;
  }
}

class ToggleComponent {
  toggleEl = createDiv();
  value = false;
  private callback: (value: boolean) => unknown = () => undefined;
  constructor(containerEl: HTMLElement) {
    this.toggleEl.className = "checkbox-container";
    containerEl.appendChild(this.toggleEl);
    this.toggleEl.addEventListener("click", () => {
      this.setValue(!this.value);
      void this.callback(this.value);
    });
  }
  setValue(value: boolean): this {
    this.value = value;
    this.toggleEl.classList.toggle("is-enabled", value);
    return this;
  }
  onChange(callback: (value: boolean) => unknown): this {
    this.callback = callback;
    return this;
  }
}

class ButtonComponent {
  buttonEl = createEl("button");
  constructor(containerEl: HTMLElement) {
    containerEl.appendChild(this.buttonEl);
  }
  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }
  setCta(): this {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }
  onClick(callback: () => unknown): this {
    this.buttonEl.addEventListener("click", () => void callback());
    return this;
  }
}

export class Setting {
  settingEl = createDiv();
  nameEl = createDiv();
  descEl = createDiv();
  controlEl = createDiv();
  constructor(containerEl: HTMLElement) {
    this.settingEl.className = "setting-item";
    this.nameEl.className = "setting-item-name";
    this.descEl.className = "setting-item-description";
    this.controlEl.className = "setting-item-control";
    const info = createDiv();
    info.append(this.nameEl, this.descEl);
    this.settingEl.append(info, this.controlEl);
    containerEl.appendChild(this.settingEl);
  }
  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }
  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }
  setHeading(): this {
    this.settingEl.classList.add("setting-item-heading");
    return this;
  }
  addText(callback: (text: TextComponent) => unknown): this {
    void callback(new TextComponent(this.controlEl));
    return this;
  }
  addToggle(callback: (toggle: ToggleComponent) => unknown): this {
    void callback(new ToggleComponent(this.controlEl));
    return this;
  }
  addButton(callback: (button: ButtonComponent) => unknown): this {
    void callback(new ButtonComponent(this.controlEl));
    return this;
  }
}

export class PluginSettingTab {
  containerEl: HTMLElement = createDiv();
  constructor(
    public app: App,
    public plugin: Plugin
  ) {}
}

export abstract class AbstractInputSuggest<T> {
  closed = false;
  constructor(
    public app: App,
    public inputEl: HTMLInputElement
  ) {}
  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
  close(): void {
    this.closed = true;
  }
}

export class Plugin {
  /** What `loadData` returns and `saveData` last stored. */
  data: unknown = null;
  views = new Map<string, (leaf: WorkspaceLeaf) => ItemView>();
  ribbonIcons: { icon: string; title: string; callback: () => unknown }[] = [];
  commands: { id: string; name: string; callback?: () => unknown }[] = [];
  settingTabs: PluginSettingTab[] = [];
  constructor(public app: App) {}
  loadData(): Promise<unknown> {
    return Promise.resolve(this.data);
  }
  saveData(data: unknown): Promise<void> {
    this.data = data;
    return Promise.resolve();
  }
  registerView(type: string, creator: (leaf: WorkspaceLeaf) => ItemView): void {
    this.views.set(type, creator);
  }
  addRibbonIcon(icon: string, title: string, callback: () => unknown): HTMLElement {
    this.ribbonIcons.push({ icon, title, callback });
    return createDiv();
  }
  addCommand(command: { id: string; name: string; callback?: () => unknown }): void {
    this.commands.push(command);
  }
  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }
}
