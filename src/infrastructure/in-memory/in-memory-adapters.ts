import type { SettingsRepository, WorkspaceGateway } from "../../domain/interfaces/ports";

export class InMemorySettingsRepository implements SettingsRepository {
  saved: Record<string, unknown> | null;
  constructor(initial: Record<string, unknown> | null = null) {
    this.saved = initial;
  }
  load(): Promise<Record<string, unknown> | null> {
    return Promise.resolve(this.saved);
  }
  save(data: Record<string, unknown>): Promise<void> {
    this.saved = data;
    return Promise.resolve();
  }
}

/** Records which notes were opened. */
export class InMemoryWorkspaceGateway implements WorkspaceGateway {
  readonly opened: { path: string; newTab: boolean }[] = [];
  openNote(path: string, options?: { newTab?: boolean }): Promise<void> {
    this.opened.push({ path, newTab: options?.newTab ?? false });
    return Promise.resolve();
  }
}
