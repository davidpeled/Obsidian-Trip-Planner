/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings. A trip day is a date on
 * the calendar, not an instant, so everything runs in UTC and never drifts
 * with the user's time zone or daylight saving.
 */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const toMs = (date: IsoDate): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

/** The date if `value` is a real calendar date written `YYYY-MM-DD` (year 1000 or later), else null. */
export function parseIsoDate(value: unknown): IsoDate | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text < "1000") return null;
  return fromMs(toMs(text)) === text ? text : null; // rejects 2026-02-30
}

export const addDays = (date: IsoDate, days: number): IsoDate => fromMs(toMs(date) + days * MS_PER_DAY);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: IsoDate, to: IsoDate): number => Math.round((toMs(to) - toMs(from)) / MS_PER_DAY);

/** Every date from `start` to `end`, inclusive. Empty when `end` is before `start`. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  return Array.from({ length: Math.max(0, daysBetween(start, end) + 1) }, (_, i) => addDays(start, i));
}

export const weekday = (date: IsoDate): string => WEEKDAYS[new Date(toMs(date)).getUTCDay()];

const monthDay = (date: IsoDate): string => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

/** "Wed, Apr 1" */
export const formatDay = (date: IsoDate): string => `${weekday(date)}, ${monthDay(date)}`;

/** "Apr 1 – Apr 10, 2026"; the year is repeated on both ends only when the trip crosses a year. */
export function formatRange(start: IsoDate, end: IsoDate): string {
  if (start === end) return `${monthDay(start)}, ${start.slice(0, 4)}`;
  if (start.slice(0, 4) === end.slice(0, 4)) return `${monthDay(start)} – ${monthDay(end)}, ${start.slice(0, 4)}`;
  return `${monthDay(start)}, ${start.slice(0, 4)} – ${monthDay(end)}, ${end.slice(0, 4)}`;
}
