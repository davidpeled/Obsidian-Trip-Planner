import { NOTE_TYPES, SECTIONS, type Trip, type TripDay, type TripStatus, type VaultNote } from "../contracts/trip";
import { type IsoDate, parseIsoDate } from "./dates";
import { OVERVIEW_FILE, basename, dirname } from "./trip-scaffold";

const typeOf = (note: VaultNote): unknown => note.frontmatter?.type;

function statusOn(today: IsoDate, start: IsoDate, end: IsoDate): TripStatus {
  if (today < start) return "upcoming";
  return today > end ? "past" : "current";
}

/**
 * Finds the trips among `notes`: every note with `type: trip` and a valid `start` date is a trip (a
 * missing or invalid `end` means a one-day trip). The flights, hotels, day and other notes belong to the
 * trip whose folder is the *nearest* one above them, so a trip nested inside another keeps its own notes.
 * Sorted by start date, then name.
 */
export function discoverTrips(notes: VaultNote[], today: IsoDate): Trip[] {
  const overviews = notes.filter((n) => typeOf(n) === NOTE_TYPES.trip);
  // Every trip note counts for ownership, even one too broken to list, so it can't hide inside a folder we'd delete.
  const folders = overviews.map((o) => dirname(o.path));

  /** The folder of the closest trip above `path` ("" when the note isn't inside any trip). */
  const nearestTripFolder = (path: string): string =>
    folders.filter((f) => f !== "" && path.startsWith(`${f}/`)).reduce((best, f) => (f.length > best.length ? f : best), "");

  const trips: Trip[] = [];
  for (const overview of overviews) {
    const start = parseIsoDate(overview.frontmatter?.start);
    if (!start) continue;
    const parsedEnd = parseIsoDate(overview.frontmatter?.end);
    const end = parsedEnd && parsedEnd >= start ? parsedEnd : start;

    const folder = dirname(overview.path);
    const inside = folder === "" ? [] : notes.filter((n) => nearestTripFolder(n.path) === folder);
    const first = (type: string): string | null => inside.find((n) => typeOf(n) === type)?.path ?? null;

    const days: TripDay[] = inside
      .filter((n) => typeOf(n) === NOTE_TYPES.day)
      .flatMap((n) => {
        const date = parseIsoDate(n.frontmatter?.date);
        return date ? [{ date, path: n.path }] : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path))
      .map((d, i) => ({ ...d, number: i + 1 }));

    const name = overview.frontmatter?.name;
    trips.push({
      name: typeof name === "string" && name.trim() ? name.trim() : basename(folder),
      folder,
      overviewPath: overview.path,
      start,
      end,
      status: statusOn(today, start, end),
      ownsFolder:
        folder !== "" &&
        basename(overview.path) === OVERVIEW_FILE &&
        folders.filter((f) => f === folder).length === 1 &&
        !folders.some((f) => f.startsWith(`${folder}/`)),
      sections: Object.fromEntries(
        SECTIONS.flatMap((s) => {
          const path = first(NOTE_TYPES[s]);
          return path ? [[s, path]] : [];
        })
      ),
      days,
    });
  }
  return trips.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
}
