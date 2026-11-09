import type { Clock } from "../../domain/interfaces/ports";

/** Today's date on the user's own calendar (local time, not UTC). */
export const systemClock: Clock = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
