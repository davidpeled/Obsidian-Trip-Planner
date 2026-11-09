# Architectural Review: Trip Planner (whole project, v0.1.0 as written)

> **Status: all findings addressed** (see "Resolution" at the end). The review below is kept as written.

- **Scope:** all of `src/` (no git history yet, so there is no diff). Read: `architecture/service-trip-planner.md`, `eslint.config.mjs`, `src/architecture.spec.ts`, every source file.
- **Conventions:** DDD layers with ports and adapters, copied from `obsidian-brain-graph`. No `CLAUDE.md`, no `docs/`.
- **Principles checked:** layers and dependency direction, ports and adapters, composition root, errors, data safety, config, tests, conventions.
- **Not applicable (client-side Obsidian plugin, not a server):** HTTP/API design, authn/authz and the permission matrix, Postgres migrations, keyset pagination, health endpoints, statelessness/scaling. Obsidian's own vault permissions are the only access control; the review of input validation below stands in for the security section.
- **Date:** 2026-11-09

## Verdict

**Request changes.** The layering is clean and mechanically enforced, the composition root is the only place adapters are chosen, and the domain is pure and well tested. But the new **delete** feature has a verified hazard: the folder it removes is derived from where a trip note happens to sit, and for a hand-written trip note that can be a shared folder or the vault root. That should be fixed before anyone uses delete on a real vault.

## Blocking

| # | Location | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| B1 | `domain/model/trip-discovery.ts:26`, `application/services/trip.service.ts:32`, `infrastructure/obsidian/obsidian-trip-vault.repository.ts:34` | **Delete trashes `dirname(overview)`, which is not always a folder the trip owns.** A trip is any note with `type: trip`; its "folder" is simply the note's directory. The README advertises hand-written trips. The only guard in `delete` is "some discovered trip has this folder". | Reproduced with the in-memory twin: notes `Areas/Trips/Japan.md` and `Areas/Trips/Rome.md` (`type: trip`) produce two cards that both offer `"Areas/Trips"` for deletion, so deleting "Japan" would trash Rome and everything else in `Areas/Trips`. A trip note at the vault root (`Overview.md`) yields folder `""`, and `delete("")` returns `{ ok: true }`; the Obsidian adapter resolves that to the vault root folder. The confirmation shows a file count, but only after the fact is it visible that the folder is far larger than "a trip". | Data loss of unrelated notes (recoverable only if the user's "Deleted files" setting keeps a trash). Worst case is the whole vault root. | Treat a folder as deletable only when all hold: it is not empty or the root; exactly one `type: trip` note lives directly in it and none deeper (no nested or sibling trips); the overview is the note the plugin created (`Overview.md`) or the user accepts a stronger confirmation. Compute this once in the domain (`Trip.ownsFolder: boolean`), hide the button when false, and have `delete` re-check it. Add the reproduction above as a test. |

## Suggestions

| # | Location | Finding | Fix |
|---|---|---|---|
| S1 | `domain/model/trip-discovery.ts:27` | **Nested trips borrow each other's notes.** `inside` is every typed note under the folder at any depth. Verified: trip `A` containing trip `B` reports 4 day notes instead of 2, and `first(type)` can pick B's Flights for A. | Assign each note to its nearest enclosing trip folder (longest matching prefix). Add a test. This also makes B1's ownership rule precise. |
| S2 | `application/services/trip.service.ts:17-21`, `infrastructure/obsidian/obsidian-trip-vault.repository.ts:22-23` | **Creation is not atomic.** `exists` then `write` is check-then-act, and `write` creates folders then notes one by one. A failure on note 5 of 11 (invalid name for the file system, sync conflict) leaves a half-built trip folder, and the retry is then refused as "already exists". Two quick submits can also race: the second `vault.create` throws "File already exists" after the first succeeded, so the user sees an error for a trip that was created. | Disable the "Create trip" button while a create is in flight (`new-trip.modal.ts:86,89`). On a write failure, remove what this call created (only folders it created itself) or report the leftover path in the error. Keep `exists` as the friendly pre-check, not the safety net. |
| S2b | `infrastructure/in-memory/in-memory-trip-vault.repository.ts` | The in-memory twin silently overwrites an existing file, unlike Obsidian's `vault.create`, so it can't expose S2. | Make the twin throw on an existing path, and run one shared contract spec against both adapters (the reference repo has `vault-repository.contract.ts`). |
| S3 | `infrastructure/obsidian/trips.view.ts:36-44` | **Domain knowledge in the adapter.** Deciding that a metadata change "is one of ours" (`TRIP_NOTE_TYPES.includes(type)`) is a rule, not rendering. Only the view uses it, so it's untested. | Move it behind the controller (`controller.isTripChange(path, frontmatter)`), next to `affects`, and test it. |
| S4 | `infrastructure/obsidian/trips.view.ts:55-56` | **Stale render can win.** Renders are debounced but `render()` awaits the read and then rebuilds; two overlapping renders finish in arbitrary order and the older read can overwrite the newer. | Keep a render sequence number and drop results from superseded calls. |
| S5 | `domain/model/trip-scaffold.ts:187` | `sectionDef` uses an `as` cast around `FOLDER_SECTIONS[s] ?? FLAT_SECTIONS[s]`. If a section is added to `SECTIONS` and not to either table, it crashes at runtime instead of failing to compile. | Make the two tables one `Record<TripSection, …>` (exhaustive, no cast), with a `kind: "folder" \| "file"` field. |
| S6 | `domain/model/trip-scaffold.ts` (`normalizeLocation`) | Locations whose segments start with `.` (e.g. `.obsidian/x`) are accepted. Obsidian does not index dot-folders, so such a trip would be created but never appear on the dashboard (**unverified**, from Obsidian's documented behavior). | Reject segments starting with `.` in `validateDraft` (the `.`/`..` rule becomes one rule). |
| S7 | Fixed | `obsidian` stub + `FakeObsidianApp` + a shared vault contract spec. It caught a real gap (whitespace passed the root guard). The view, both modals, the settings tab, the folder suggester, the gateways and the plugin entry are now unit-tested too (including the S4 out-of-order render case and an end-to-end create through the real Obsidian adapter). Real rendering and Obsidian itself remain untested. |

## Nits

- `application/controllers/trips.controller.ts`: `knownFolders` is mutable state set as a side effect of `dashboard()`; it works, but `affects()` silently depends on call order. Document it or move it into a small `TripIndex` object.
- `domain/contracts/trip.ts` re-exports shape and constants (`NOTE_TYPES`, `SECTIONS`, `TRIP_NOTE_TYPES`) from a "contracts" file; constants live more naturally in `domain/model`.
- Error style: `Result` unions at the service boundary instead of `DomainError` codes. Fine for a plugin; just keep it consistent as services are added.
- `eslint.config.mjs` and `architecture.spec.ts` duplicate the layer rules by design (as in the reference repo); keep them in step.

## What is done well

- **Layering is correct and enforced twice.** `src/architecture.spec.ts` (27 checks) plus ESLint import restrictions; `obsidian` is imported only by `infrastructure/obsidian` and `bootstrap/plugin.ts`; domain and application are DOM-free.
- **Ports and adapters with twins.** Every outbound capability (`TripVaultRepository`, `WorkspaceGateway`, `SettingsRepository`, `Clock`) is a port with an in-memory twin, so use cases are tested end to end through the real composition root (`createTripContainer`) with no Obsidian.
- **Composition root only.** Adapters are chosen in `bootstrap/plugin.ts`; no singletons or hidden globals; the clock is injected (tests pin "today").
- **Pure planning, one write.** `planTrip` returns data (`TripPlan`), which is why the scaffold is so thoroughly tested.
- **Input validated at the edge of the domain.** `validateDraft` rejects `..`, illegal characters, bad dates, oversize trips; settings are sanitized on load (including the legacy `tripsFolder` key); creation never overwrites.
- **Calendar dates are timezone-safe** (UTC arithmetic on `YYYY-MM-DD`, DST tested).
- **Delete is guarded in layers:** confirmation modal with Cancel focused, trash not permanent, service re-verifies the folder (B1 is the gap in that check, not the approach).
- **Bundle budget** enforced in the build (21 KB of 100 KB).

## Enforcement opportunities

- A domain test that asserts **every deletable folder is owned by exactly one trip** (B1/S1), using a property-style check over a few vault shapes (shared folder, root, nested, siblings).
- A **contract spec** run against both vault repository implementations (S2b, S7).
- A **compile-time exhaustiveness** check for `TripSection` tables (S5), e.g. `Record<TripSection, …>` instead of `Partial<Record<…>>` plus a cast.
- An ESLint rule (or the existing architecture spec) forbidding `as` casts in `domain/` outside explicit allow-listed files.

## Unverified / questions

- Whether `getFolderByPath("/")` returns the vault root and `fileManager.trashFile` would act on it. B1's hazard stands either way: the service must never ask. I did not run anything against a real vault.
- S6 (dot-folders not indexed) is from documentation and memory, not tested.
- S2's race depends on Obsidian's `vault.create` rejecting an existing path, which is its documented behavior; the in-memory twin does not reproduce it.
- Should a hand-written trip note (not created by this plugin) be deletable from the dashboard at all? My recommendation is no: show it, but hide the delete button.

## Resolution

| # | Status | What changed |
|---|---|---|
| B1 | Fixed | `Trip.ownsFolder` (not root; no other trip note beside or inside, including unlistable ones; overview is `Overview.md`). The dashboard hides delete when false (`TripCard.deletable`), `TripService.delete` re-checks it and refuses with a reason, and the Obsidian adapter refuses the vault root (also whitespace). Tests reproduce the shared-folder and root cases. |
| S1 | Fixed | Notes belong to the *nearest* enclosing trip folder. Tests: nested trips keep their own days and flights. |
| S2 | Fixed | `write` is all or nothing and rolls back only what it created; creates are serialized in the service; the form disables its button while creating. Tests: concurrent create, write failure as a result. |
| S2b | Fixed | The in-memory twin now throws on an existing file and rolls back like the adapter. |
| S3 | Fixed | `controller.affectsChange(path, frontmatter)` holds the rule; the view just asks. Tested. |
| S4 | Fixed | The view keeps a render sequence number; only the newest read draws. (Not unit-tested: it lives in the view.) |
| S5 | Fixed | One `Record<TripSection, SectionDef>`; no cast. |
| S6 | Fixed | Locations with any dot-folder segment are rejected (this subsumes the `.`/`..` rule). Still unverified against real Obsidian that dot-folders aren't indexed; the rule is harmless either way. |
| S7 | Fixed for the vault adapter | `obsidian` stub + `FakeObsidianApp` + a shared contract spec run against both repositories. It already caught a real gap (whitespace passed the root guard). The view, modals, settings tab and workspace gateway are still untested: they need a DOM and a fuller Obsidian fake. |
| Nits | Partly | Documented that `affects` only knows trips after `dashboard()` ran. Left as is: constants in `domain/contracts`, `Result` unions instead of `DomainError`, the duplicated layer rules. |
