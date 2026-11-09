import { SECTIONS, type Trip, type TripSection } from "../../domain/contracts/trip";
import { type IsoDate, daysBetween, formatDay, formatRange } from "../../domain/model/dates";
import type { DashboardSection, DashboardView, TripCard } from "../contracts/dashboard";

const SECTION_LABELS: Record<TripSection, string> = {
  flights: "Flights",
  hotels: "Hotels",
  transportation: "Transportation",
  attractions: "Attractions",
  tickets: "Tickets",
  packing: "Packing",
  documents: "Documents",
};

const length = (trip: Trip): number => daysBetween(trip.start, trip.end) + 1;

/** Relative wording stays short: days up close, then weeks, then months. Nothing reads "340 days ago". */
function badge(trip: Trip, today: IsoDate): string {
  switch (trip.status) {
    case "current":
      return `Day ${daysBetween(trip.start, today) + 1} of ${length(trip)}`;
    case "upcoming": {
      const days = daysBetween(today, trip.start);
      if (days === 1) return "Starts tomorrow";
      if (days <= 14) return `Starts in ${days} days`;
      if (days < 60) return `Starts in ${Math.round(days / 7)} weeks`;
      return `Starts in ${Math.round(days / 30.4)} months`;
    }
    case "past": {
      const days = daysBetween(trip.end, today);
      if (days === 1) return "Ended yesterday";
      return days <= 7 ? `Ended ${days} days ago` : "Completed";
    }
  }
}

function toCard(trip: Trip, today: IsoDate): TripCard {
  const todayNote = trip.status === "current" ? trip.days.find((d) => d.date === today) : undefined;
  return {
    name: trip.name,
    folder: trip.folder,
    deletable: trip.ownsFolder,
    dateRange: formatRange(trip.start, trip.end),
    badge: badge(trip, today),
    progress: trip.status === "current" ? (daysBetween(trip.start, today) + 1) / length(trip) : null,
    overview: { kind: "overview", label: "Overview", path: trip.overviewPath },
    quickLinks: [
      ...(todayNote ? [{ kind: "today" as const, label: "Today", path: todayNote.path }] : []),
      ...SECTIONS.flatMap((s) => (trip.sections[s] ? [{ kind: s, label: SECTION_LABELS[s], path: trip.sections[s] }] : [])),
    ],
    days: trip.days.map((d) => ({ kind: "day" as const, number: d.number, label: formatDay(d.date), path: d.path, isToday: d.date === today })),
  };
}

/** Groups trips into current / upcoming / past. Upcoming runs soonest first, past most recent first. */
export function toDashboard(trips: Trip[], today: IsoDate): DashboardView {
  const by = (status: Trip["status"]) => trips.filter((t) => t.status === status);
  const sections: DashboardSection[] = [
    { id: "current", title: "Happening now", trips: by("current").map((t) => toCard(t, today)) },
    { id: "upcoming", title: "Upcoming", trips: by("upcoming").map((t) => toCard(t, today)) },
    { id: "past", title: "Past", trips: by("past").reverse().map((t) => toCard(t, today)) },
  ];
  return { sections: sections.filter((s) => s.trips.length > 0) };
}
