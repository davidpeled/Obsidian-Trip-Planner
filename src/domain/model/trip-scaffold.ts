import { NOTE_TYPES, SECTIONS, type PlannedNote, type TripSection, type TripDraft, type TripPlan } from "../contracts/trip";
import { type IsoDate, daysBetween, eachDay, formatDay, formatRange, parseIsoDate, weekday } from "./dates";

export const OVERVIEW_FILE = "Overview.md";
export const FLIGHTS_FILE = "Flights.md";
export const TRANSPORTATION_FILE = "Transportation.md";
export const ATTRACTIONS_FILE = "Attractions.md";
export const SCHEDULE_FOLDER = "Schedule";
export const INDEX_FILE = "Index.md";
export const MAX_TRIP_DAYS = 366;

/** Characters Obsidian or the file system won't take in a file name, or that break links. */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

/** A name that is safe to use as a folder name. */
export const cleanTripName = (name: string): string =>
  name.replace(ILLEGAL_NAME_CHARS, " ").replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim();

/** Folder names can't hold these either (a `/` is fine here: it separates nested folders). */
const ILLEGAL_LOCATION_CHARS = /[\\:*?"<>|#^[\]]/;

/** "Areas//Trips/" becomes "Areas/Trips". */
export const normalizeLocation = (location: string): string => joinPath(...location.split("/").map((part) => part.trim()));

/** The folder a trip called `name` gets inside `location`. */
export const tripFolder = (location: string, name: string): string => joinPath(normalizeLocation(location), cleanTripName(name));

export const joinPath = (...parts: string[]): string =>
  parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/");

export const dirname = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
export const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Why `location` can't hold a trip, or null when it can. */
export function validateLocation(location: string): string | null {
  const normalized = normalizeLocation(location);
  if (ILLEGAL_LOCATION_CHARS.test(normalized)) return "The location has characters that can't be used in folder names.";
  // "." and ".." climb out of the folder; other dot-folders are hidden, so Obsidian wouldn't index (or show) the trip.
  if (normalized.split("/").some((part) => part.startsWith("."))) return "The location can't contain folders that start with a dot.";
  return null;
}

/** Why the draft can't become a trip, or null when it can. */
export function validateDraft(draft: TripDraft): string | null {
  if (!cleanTripName(draft.name)) return "Give the trip a name.";
  const locationError = validateLocation(draft.location);
  if (locationError) return locationError;
  const start = parseIsoDate(draft.start);
  const end = parseIsoDate(draft.end);
  if (!start) return "Pick a valid start date.";
  if (!end) return "Pick a valid end date.";
  if (end < start) return "The trip can't end before it starts.";
  if (daysBetween(start, end) + 1 > MAX_TRIP_DAYS) return `A trip can be at most ${MAX_TRIP_DAYS} days long.`;
  return null;
}

const dayFileName = (date: IsoDate): string => `${date} ${weekday(date)}.md`;
const link = (path: string, label: string): string => `[[${path.replace(/\.md$/, "")}|${label}]]`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Frontmatter {
  type: string;
  [key: string]: string | number;
}
const frontmatter = (fields: Frontmatter): string => {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${typeof v === "string" && !/^[\w-]+$/.test(v) ? JSON.stringify(v) : v}`);
  return `---\n${lines.join("\n")}\n---\n`;
};

const table = (...columns: string[]): string[] => [`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, `| ${columns.map(() => " ").join(" | ")} |`];

interface SectionDef {
  title: string;
  /** Set for sections that live in their own folder, with an Index note so the folder is never empty and
   *  there is a place to start. Files you add (PDFs, screenshots) go in that folder beside the index.
   *  Without it, the section is a single note beside the overview. */
  folder?: string;
  body: string[];
}

/** Exhaustive on purpose: adding a `TripSection` without defining it here fails to compile. */
const SECTION_DEFS: Record<TripSection, SectionDef> = {
  hotels: {
    folder: "Hotels",
    title: "Hotels",
    body: [
      "Keep booking confirmations in this folder and list each stay below.\n",
      ...table("Hotel", "Address", "Check-in", "Check-out", "Phone", "Booking ref", "Price"),
      "\n## Notes\n",
      "- Check-in time, late arrival, breakfast, luggage storage\n",
    ],
  },
  tickets: {
    folder: "Tickets",
    title: "Tickets",
    body: [
      "Keep this trip's tickets and confirmations in this folder: drop PDFs, screenshots and QR codes here, then list them below.\n",
      "| What | Day | File | Booked |",
      "| --- | --- | --- | --- |",
      "|  |  |  | [ ] |\n",
    ],
  },
  packing: {
    folder: "Packing",
    title: "Packing",
    body: [
      "## Documents and money\n",
      "- [ ] Passport / ID",
      "- [ ] Cards and some cash",
      "- [ ] Insurance details\n",
      "## Clothes\n",
      "- [ ] \n",
      "## Toiletries and medication\n",
      "- [ ] \n",
      "## Electronics\n",
      "- [ ] Phone, chargers, power bank",
      "- [ ] Plug adapter\n",
      "## Other\n",
      "- [ ] \n",
    ],
  },
  documents: {
    folder: "Documents",
    title: "Documents",
    body: [
      "Passport and visa copies, insurance policies and anything else you may need to show or send. Keep the files in this folder and list them below.\n",
      "## Insurance\n",
      ...table("Provider", "Policy number", "Covers", "Emergency / claims phone", "File"),
      "\n## Other documents\n",
      ...table("Document", "Number", "Valid until", "File"),
      "",
    ],
  },

  flights: {
    title: "Flights",
    body: [
      "## Outbound\n",
      ...table("Date", "Flight", "From → To", "Departs", "Arrives", "Confirmation"),
      "\n## Return\n",
      ...table("Date", "Flight", "From → To", "Departs", "Arrives", "Confirmation"),
      "\n## Notes\n",
      "- Baggage, seats, check-in links\n",
    ],
  },
  transportation: {
    title: "Transportation",
    body: [
      "## Getting around\n",
      ...table("Date", "Type", "From → To", "Time", "Booking / price", "Notes"),
      "\n## Airport transfers\n",
      "## Passes and rentals\n",
      "## Notes\n",
    ],
  },
  attractions: {
    title: "Attractions & monuments",
    body: [
      "## Must see\n",
      ...table("Place", "Area", "Opening hours", "Ticket", "Day", "Done"),
      "\n## If there's time\n",
      ...table("Place", "Area", "Opening hours", "Ticket", "Day", "Done"),
      "\n## Ideas\n",
    ],
  },
};

/**
 * The folders and notes for a new trip, as pure data:
 *
 *   <location>/<name>/Overview.md                      dates, quick links, emergency numbers, day list
 *   <location>/<name>/Flights.md
 *   <location>/<name>/Transportation.md
 *   <location>/<name>/Attractions.md
 *   <location>/<name>/{Hotels,Tickets,Packing,Documents}/Index.md
 *   <location>/<name>/Schedule/<date> <weekday>.md     (one per day)
 *
 * The draft must pass `validateDraft`.
 */
export function planTrip(draft: TripDraft): TripPlan {
  const error = validateDraft(draft);
  if (error) throw new Error(error);
  const name = cleanTripName(draft.name);
  const [start, end] = [draft.start, draft.end];
  const dates = eachDay(start, end);

  const folder = tripFolder(draft.location, name);
  const overviewPath = joinPath(folder, OVERVIEW_FILE);
  const scheduleFolder = joinPath(folder, SCHEDULE_FOLDER);
  const dayPaths = dates.map((d) => joinPath(scheduleFolder, dayFileName(d)));
  const sectionPath = (s: TripSection): string => {
    const own = SECTION_DEFS[s].folder;
    return own ? joinPath(folder, own, INDEX_FILE) : joinPath(folder, `${s[0].toUpperCase()}${s.slice(1)}.md`);
  };
  const sectionDef = (s: TripSection): SectionDef => SECTION_DEFS[s];

  const trip = { trip: name };
  const sectionNote = (s: TripSection): PlannedNote => ({
    path: sectionPath(s),
    content: [
      frontmatter({ type: NOTE_TYPES[s], ...trip }),
      `# ${sectionDef(s).title} · ${name}\n`,
      `Back to ${link(overviewPath, "overview")}\n`,
      ...sectionDef(s).body,
    ].join("\n"),
  });

  const notes: PlannedNote[] = [
    {
      path: overviewPath,
      content: [
        frontmatter({ type: NOTE_TYPES.trip, name, start, end }),
        `# ${name}\n`,
        `**${formatRange(start, end)}** · ${plural(dates.length, "day")}\n`,
        "## Quick links\n",
        ...SECTIONS.map((s) => `- ${link(sectionPath(s), sectionDef(s).title)}`),
        "\n## Emergency and embassy\n",
        "Fill these in before you leave and keep them where you can reach them offline.\n",
        "| | Number / details |",
        "| --- | --- |",
        "| Local emergency number |  |",
        "| Police |  |",
        "| Ambulance |  |",
        "| Fire |  |",
        "| My embassy or consulate: phone |  |",
        "| My embassy or consulate: address |  |",
        `| Insurance emergency line | See ${link(sectionPath("documents"), "Documents")} |`,
        "| Hotel |  |",
        "| Someone back home |  |\n",
        "## Schedule\n",
        ...dates.map((d, i) => `- ${link(dayPaths[i], `Day ${i + 1} · ${formatDay(d)}`)}`),
        "\n## Before you go\n",
        "- [ ] Flights booked",
        "- [ ] Accommodation booked",
        "- [ ] Transportation sorted",
        "- [ ] Passport and visas checked",
        "- [ ] Travel insurance",
        "- [ ] Packing list\n",
      ].join("\n"),
    },
    ...SECTIONS.map(sectionNote),
    ...dates.map((date, i): PlannedNote => {
      const nav = [
        i > 0 ? `← ${link(dayPaths[i - 1], "Previous day")}` : null,
        link(overviewPath, "Overview"),
        i < dates.length - 1 ? `${link(dayPaths[i + 1], "Next day")} →` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        path: dayPaths[i],
        content: [
          frontmatter({ type: NOTE_TYPES.day, ...trip, date, day: i + 1 }),
          `# Day ${i + 1} · ${formatDay(date)}\n`,
          `${nav}\n`,
          "## Morning\n",
          "## Afternoon\n",
          "## Evening\n",
          "## Bookings\n",
          "## Notes\n",
        ].join("\n"),
      };
    }),
  ];
  // Parents first, so a location that doesn't exist yet is created level by level.
  const parents = normalizeLocation(draft.location).split("/").filter(Boolean).map((_, i, all) => all.slice(0, i + 1).join("/"));
  const sectionFolders = SECTIONS.flatMap((s) => (SECTION_DEFS[s].folder ? [joinPath(folder, SECTION_DEFS[s].folder)] : []));
  return { folder, overviewPath, folders: [...parents, folder, scheduleFolder, ...sectionFolders], notes };
}
