import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { systemClock } from "./system-clock";

describe("systemClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives today's date on the local calendar, padded", () => {
    vi.setSystemTime(new Date(2026, 0, 5, 9, 30)); // local time: 5 January
    expect(systemClock()).toBe("2026-01-05");
  });

  it("uses the local day, not the UTC day, late in the evening", () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59)); // local 31 December, whatever the offset
    expect(systemClock()).toBe("2026-12-31");
  });

  it("moves on at local midnight", () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
    const before = systemClock();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 0, 1));
    expect([before, systemClock()]).toEqual(["2026-12-31", "2027-01-01"]);
  });
});
