# Trip Planner: design

## Use cases

1. **Create a trip** from a name, a location (any vault folder) and a date range: write a folder `<location>/<name>/` with an overview, flights, transportation and one note per day.
2. **List trips** found anywhere in the vault, grouped by whether they are happening now, upcoming or past, with links into each trip's notes.

## Decisions

- **A trip is found by its frontmatter, not by folder layout.** The overview has `type: trip`, `start`, `end`; the other notes have `type: trip-day` or a section (`trip-flights`, `trip-hotels`, `trip-transportation`, `trip-attractions`, `trip-tickets`, `trip-packing`, `trip-documents`) (days also `date`). The repository returns every note with one of those types, vault-wide, and a trip owns the typed notes inside its folder. So a trip can live in any folder, e.g. `Areas/Trips/UK-trip`. This lets users rename files, nest trips (`Trips/2026/Japan`) or write one by hand.
- **Dates are calendar dates, not instants.** `YYYY-MM-DD` strings with UTC arithmetic, so daylight saving and time zones can't shift a day. Only the clock adapter reads local time ("today").
- **Creation is pure planning plus one write.** `planTrip` returns the folders and notes as data (`TripPlan`); the repository port writes it. The service refuses to write when the trip folder already exists, so it never overwrites.
- **Links use full vault paths** (`[[Trips/Japan 2026/Flights|Flights]]`) because every trip has a `Flights` note; short links would be ambiguous. Obsidian rewrites them when files are renamed through it.
- **The dashboard is a read model.** `toDashboard` produces cards with labels, badges and link targets, so the view only renders.
- **A note belongs to the nearest trip folder above it**, so nested trips keep their own notes. `Trip.ownsFolder` says whether deleting the folder deletes only this trip: not the vault root, no other trip note beside or inside it (even one too broken to list), and the overview is the plugin's own `Overview.md`. The dashboard hides delete when it's false, the service re-checks it, and the Obsidian adapter refuses the vault root as a last line.
- **A trip only goes in a new folder.** `TripService.folderProblem(location, name)` is the one rule: an unusable location, or `location/name` already existing, counts as a problem. `create` enforces it and the form asks it live (newest answer wins), so Create is blocked before you click. `TripVaultRepository.exists` ignores letter case, because the vault may live on a case-insensitive file system (a stricter-than-needed answer on Linux, by design).
- **Creating is all or nothing and serialized.** `write` rejects if a note already exists and removes only what that call created; the service runs creates one at a time so one create's rollback can't touch folders another is filling. The form also disables its button while a create is in flight.
- **Section definitions are one exhaustive `Record<TripSection, …>`**, so adding a section without defining it doesn't compile.
- **Refresh** is event-driven (metadata cache, a note of ours changing anywhere, create/delete/rename inside a shown trip or the default location, returning to the view), debounced.

- **Folders get an index note.** Hotels, Tickets, Packing and Documents are folders (they collect files: confirmations, PDFs) and each starts with `Index.md`, so the folder exists and isn't empty (empty folders don't survive sync or git). Sections are data (`SECTIONS`, `FOLDER_SECTIONS`, `FLAT_SECTIONS`), so adding one means one entry plus its icon and label.
- **Emergency and embassy numbers live in the overview**, as a table to fill in, so they are one tap from the trip's main note.

## Testing

- **Domain and use cases** run through the real composition root with the in-memory twins.
- **One contract spec** (`test-support/vault-repository.contract.ts`) runs against both the in-memory repository and the Obsidian adapter, so the twin can't drift from the adapter.
- **Obsidian-facing code** (the dashboard view, both modals, the settings tab, the folder suggester, the gateways and `bootstrap/plugin.ts`) is tested against `test-support/obsidian.stub.ts`, a runtime stand-in for the parts of the `obsidian` package the plugin uses (aliased in `vitest.config.ts`), with `test-support/obsidian-dom.ts` supplying Obsidian's `createEl`/`empty`/… DOM helpers and `FakeObsidianApp` an in-memory vault, workspace and event sources. UI specs run in happy-dom (`// @vitest-environment happy-dom`).
- The stub is only as faithful as it's written; it encodes behavior the code relies on (`create` throws on an existing path, `normalizePath("")` is `"/"`, `getAllFolders` includes the root, `debounce` is trailing). When Obsidian behaves differently, fix the stub and the test together.
- Not covered by tests: real rendering (CSS, icons) and Obsidian itself. Check the dashboard by eye in a vault (`npm run link:vault`).

## Ports

| Port | Obsidian adapter | Test twin |
|---|---|---|
| `TripVaultRepository` | `ObsidianTripVaultRepository` (vault + metadata cache) | `InMemoryTripVaultRepository` |
| `WorkspaceGateway` | `ObsidianWorkspaceGateway` | `InMemoryWorkspaceGateway` |
| `SettingsRepository` | `ObsidianSettingsRepository` (data.json) | `InMemorySettingsRepository` |
| `Clock` | `systemClock` | a lambda |
