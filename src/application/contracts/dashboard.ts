import type { TripSection } from "../../domain/contracts/trip";

/** Read model for the trips dashboard: everything the view shows, with no logic left to do. */
export type LinkKind = "overview" | "today" | "day" | TripSection;

export interface DashboardLink {
  kind: LinkKind;
  label: string;
  path: string;
}

export interface DashboardDay extends DashboardLink {
  kind: "day";
  /** 1-based day of the trip. */
  number: number;
  isToday: boolean;
}

export interface TripCard {
  name: string;
  /** The trip's folder, which is what deleting the trip removes. */
  folder: string;
  /** Whether the trip can be deleted from the dashboard (see `Trip.ownsFolder`). */
  deletable: boolean;
  /** "Apr 1 – Apr 10, 2026" */
  dateRange: string;
  /** "Day 3 of 10", "Starts in 12 days", "Ended yesterday"; old trips say "Completed" (the dates already say when). */
  badge: string;
  /** How far through a current trip we are, 0 to 1; null otherwise. */
  progress: number | null;
  overview: DashboardLink;
  /** Today's note (during the trip), then the trip's other notes in a fixed order. Only those that exist. */
  quickLinks: DashboardLink[];
  days: DashboardDay[];
}

export interface DashboardSection {
  id: "current" | "upcoming" | "past";
  title: string;
  trips: TripCard[];
}

export interface DashboardView {
  /** Only the sections that have trips. */
  sections: DashboardSection[];
}
