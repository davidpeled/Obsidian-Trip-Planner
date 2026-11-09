import type { IsoDate } from "../model/dates";

/** What the user types in the "new trip" form. */
export interface TripDraft {
  name: string;
  /** Vault folder the trip's own folder goes in, e.g. `Areas/Trips`. Empty means the vault root. */
  location: string;
  start: IsoDate;
  end: IsoDate;
}

/** A note to create: a vault-relative path and its full text. */
export interface PlannedNote {
  path: string;
  content: string;
}

/** Everything creating a trip writes. */
export interface TripPlan {
  /** The trip's own folder, e.g. `Areas/Trips/Japan 2026`. */
  folder: string;
  overviewPath: string;
  /** Folders to create, parents before children. */
  folders: string[];
  notes: PlannedNote[];
}

/** A markdown note in the vault with its parsed frontmatter, as the trip scanner sees it. */
export interface VaultNote {
  path: string;
  frontmatter: Record<string, unknown> | null;
}

export type TripStatus = "current" | "upcoming" | "past";

export interface TripDay {
  date: IsoDate;
  /** 1-based position within the trip. */
  number: number;
  path: string;
}

/** A trip found in the vault. */
export interface Trip {
  name: string;
  folder: string;
  overviewPath: string;
  start: IsoDate;
  end: IsoDate;
  status: TripStatus;
  /**
   * Whether the trip's folder is the trip's alone, so removing the folder removes just this trip: it is not
   * the vault root, holds no other trip (beside or inside it), and its overview is the `Overview.md` this
   * plugin creates. Trips written by hand into a shared folder are shown but never offered for deletion.
   */
  ownsFolder: boolean;
  /** The trip's other notes, by section; only the ones that exist. */
  sections: Partial<Record<TripSection, string>>;
  days: TripDay[];
}

/** Values of the `type` frontmatter property that mark the notes this plugin creates and finds. */
export const NOTE_TYPES = {
  trip: "trip",
  flights: "trip-flights",
  hotels: "trip-hotels",
  transportation: "trip-transportation",
  attractions: "trip-attractions",
  tickets: "trip-tickets",
  packing: "trip-packing",
  documents: "trip-documents",
  day: "trip-day",
} as const;

/** The notes every trip has besides its overview and day notes, in the order they are listed. */
export const SECTIONS = ["flights", "hotels", "transportation", "attractions", "tickets", "packing", "documents"] as const;
export type TripSection = (typeof SECTIONS)[number];

export const TRIP_NOTE_TYPES: readonly string[] = Object.values(NOTE_TYPES);
