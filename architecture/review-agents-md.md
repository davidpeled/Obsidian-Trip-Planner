# Architectural Review: AGENTS.md scaffold for new trips

> **Status: all findings addressed** (see "Resolution" at the end). The review below is kept as written.

- **Scope:** uncommitted diff on `main`: `src/domain/model/trip-scaffold.ts`, `README.md`, and the specs that count files (`application.spec.ts`, `domain.spec.ts`, `trips.view.spec.ts`, `test-support/vault-repository.contract.ts`). Also read `architecture/service-trip-planner.md` and `src/architecture.spec.ts`.
- **Conventions:** DDD layers with ports and adapters, enforced by `eslint.config.mjs` and `architecture.spec.ts`. No `CLAUDE.md`, no `docs/architecture.md`; `architecture/service-trip-planner.md` is the design doc.
- **Principles checked:** layers and dependency direction, ports and adapters, composition root, data safety (create/delete), security, tests, docs, conventions.
- **Not applicable (client-side Obsidian plugin):** HTTP/API design, authn/authz and permission matrix, Postgres migrations, pagination, health endpoints, statelessness.
- **Date:** 2026-11-11

## Verdict

**Approve with suggestions.** The change stays inside the domain (pure data, no new imports, no DOM, no I/O), goes through the existing `planTrip` -> `TripVaultRepository.write` path, and so inherits the all-or-nothing write and the delete safety checks without new code. Nothing blocks merging. The one finding worth fixing first is that the guardrail text contradicts the instruction to fill in `Documents/Index.md` (S1). The guardrails are also only advisory and only apply when the agent starts in the trip folder (S2).

## Blocking

None.

## Suggestions

| # | Location | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | `trip-scaffold.ts` (`agentsNote`, guardrail 3 vs the "Where things go" table) | **Contradictory instruction.** Guardrail 3 says to treat "anything in `Documents/`" as sensitive and "do not read it". The table then tells the agent to fill `Documents/Index.md`, which lives in that folder. An agent has to break one rule, and may refuse to fill the note or ignore the guardrail. | Read the generated text: both lines are in the same file. | Scope the rule to attachments: "files in `Documents/` other than `Index.md`". Say what is allowed on `Index.md`: names, expiry dates, no ID or policy numbers. Add a test that the guardrail text names `Index.md` as the exception. |
| S2 | `trip-scaffold.ts` / `README.md` | **The guardrails only bind an agent that actually loads this file.** `AGENTS.md` sits in the trip folder, so an agent started at the vault root (the common case) may never read it, and the PDF/Documents rules never apply. Even when loaded, it is a request, not access control. The README says the second part; it does not say the first. (**Unverified:** which tools pick up a nested `AGENTS.md` varies by tool and version.) | The file is written only to `<trip folder>/AGENTS.md`. | Say in the README to start the agent in the trip folder, or add a vault-root `AGENTS.md` pointer. Consider a setting that writes the same short guardrail block once at the vault root. Mention tool-level deny rules (e.g. `**/*.pdf`, `**/Documents/**`) as the real enforcement. |
| S3 | Existing trips | **Trips created before this change get no `AGENTS.md`.** There is no command to add one, so users with existing trips have no guardrail. | `planTrip` runs only on create; nothing re-scaffolds. | Add a small "Add agent guide to this trip" action that writes `AGENTS.md` if absent (never overwrites). Or state in the README that only new trips get it. |
| S4 | `docs` | **Design doc not updated.** `architecture/service-trip-planner.md` lists what a trip scaffold contains and the decisions behind it; the new file and why it has no `type` are not there. | `grep AGENTS architecture/` finds nothing. | Add one decision: "`AGENTS.md` is untyped on purpose, so the scanner and `ownsFolder` ignore it; it still counts in the delete file count." |

## Nits

- `agentsNote` hard-codes `Overview.md`, `Documents/` and `Schedule/` although `OVERVIEW_FILE`, `SCHEDULE_FOLDER` and `SECTION_DEFS.documents.folder` exist. Use them so a rename can't leave the guide stale.
- `vault-repository.contract.ts` now expects `plan.notes.length - 1` typed notes. Count the notes that have a `type:` frontmatter instead, so adding another untyped note doesn't need another magic number.
- `trip-scaffold.ts` grows by about 45 lines of prose. If more generated guides follow, move the template to its own module (`trip-agent-guide.ts`) that takes the section paths.
- The `architecture.spec.ts` DOM check scans string literals, so ordinary words like "document" in generated prose triggered it. Strip string literals as well as comments, or keep avoiding the word. (I reworded the text; the check itself is brittle.)

## What is done well

- Pure data in the domain: no new imports, dependency direction unchanged, no adapter code touched.
- `AGENTS.md` has no `type`, so `discoverTrips` and `ownsFolder` ignore it, and the delete confirmation counts it among the folder's files. The contract spec runs it against both the in-memory and Obsidian adapters.
- It is appended last, so existing positional test destructuring still holds, and creation rollback needs no change.
- A new test covers the content (guardrail wording, per-section paths, no frontmatter), and the README states the advisory limit honestly.

## Enforcement opportunities

- A domain test that every `TripSection` appears in the generated guide's table (iterate `SECTIONS`), so a new section can't be left out.
- Make the DOM-globals check ignore string literals.

## Unverified / questions

- Which agent tools load a nested `AGENTS.md`, and from which working directory (S2).
- Whether you want older trips back-filled (S3) or only new ones.

## Resolution

- **S1:** the Documents guardrail now covers every file in `Documents/` except `Index.md`, and says what may go in the index (no ID or policy numbers). Tests pin both sentences.
- **S2:** the README now says the guide only helps when the agent reads it (start the agent in the trip folder), that it is a request and not access control, and suggests deny rules for `**/*.pdf` and `**/Documents/**`. I did not add a vault-root pointer or a setting for it.
- **S3:** `planAgentGuide`, `TripService.addAgentGuide`, `TripsController.addAgentGuide` and a robot-icon button on cards of trips that own their folder. It goes through `vault.write` (so no new port, never overwrites, case-insensitive check) and is tested in the application and view specs.
- **S4:** `architecture/service-trip-planner.md` records the decision.
- **Nits:** the guide uses `OVERVIEW_FILE`, `SCHEDULE_FOLDER` and the Documents folder from `SECTION_DEFS`; the contract spec compares paths of notes that have a `type:` instead of a count minus one; a test checks every section appears in the guide; the DOM check in `architecture.spec.ts` now ignores string literals as well as comments. The template stays in `trip-scaffold.ts` (it needs `SECTION_DEFS`); worth moving only if more generated guides follow.
