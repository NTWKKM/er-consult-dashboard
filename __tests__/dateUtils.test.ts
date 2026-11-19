import { describe, it, expect } from "vitest";
import {
  BANGKOK_OFFSET_MIN,
  MAX_EXPORT_DAYS,
  getUtcRangeForLocalDate,
  inclusiveDayCount,
} from "@/lib/dateUtils";

describe("dateUtils (Asia/Bangkok fixed)", () => {
  it("defaults to Asia/Bangkok (UTC+7 / -420 min) regardless of host timezone", () => {
    expect(BANGKOK_OFFSET_MIN).toBe(-420);
    const range = getUtcRangeForLocalDate("2026-01-15");
    expect(range).toEqual({
      start: "2026-01-14T17:00:00.000Z",
      endExclusive: "2026-01-15T17:00:00.000Z",
    });
  });

  it("supports explicitOffset override for custom timezone tests", () => {
    const range = getUtcRangeForLocalDate("2026-01-15", 0);
    expect(range).toEqual({
      start: "2026-01-15T00:00:00.000Z",
      endExclusive: "2026-01-16T00:00:00.000Z",
    });
  });

  it("rejects malformed date strings and impossible calendar dates", () => {
    expect(() => getUtcRangeForLocalDate("2026-1-1")).toThrow(/Invalid date format/);
    expect(() => getUtcRangeForLocalDate("2026-02-30")).toThrow(/Invalid calendar date/);
    expect(() => getUtcRangeForLocalDate("2026-04-31")).toThrow(/Invalid calendar date/);
    expect(() => getUtcRangeForLocalDate("2025-02-29")).toThrow(/Invalid calendar date/);
    expect(getUtcRangeForLocalDate("2024-02-29").start).toBe("2024-02-28T17:00:00.000Z");
  });

  it("computes inclusiveDayCount accurately for the 31-day export safeguard", () => {
    expect(MAX_EXPORT_DAYS).toBe(31);
    expect(inclusiveDayCount("2026-01-01", "2026-01-01")).toBe(1);
    expect(inclusiveDayCount("2026-01-01", "2026-01-31")).toBe(31);
    // Regression B5: Jan 1 -> Feb 1 is 32 inclusive days and must exceed MAX_EXPORT_DAYS
    expect(inclusiveDayCount("2026-01-01", "2026-02-01")).toBe(32);
    expect(inclusiveDayCount("2026-01-01", "2026-02-01") <= MAX_EXPORT_DAYS).toBe(false);
  });
});
