/**
 * Helper to get the UTC ISO range [start, endExclusive) for a given local "YYYY-MM-DD" date.
 * Computes the offset for the target date itself to handle DST correctly.
 */
export function getUtcRangeForLocalDate(date: string, explicitOffset?: number) {
    const [year, month, day] = date.split("-").map(Number);

    // If explicitOffset is provided, use it for both start and end to test specific TZ behaviors.
    // Otherwise, compute per-date offsets to handle DST transitions.
    const offsetStart = explicitOffset !== undefined ? explicitOffset : new Date(year, month - 1, day).getTimezoneOffset();
    const offsetEnd = explicitOffset !== undefined ? explicitOffset : new Date(year, month - 1, day + 1).getTimezoneOffset();

    const start = new Date(Date.UTC(year, month - 1, day, 0, offsetStart));
    const endExclusive = new Date(Date.UTC(year, month - 1, day + 1, 0, offsetEnd));
    return { start: start.toISOString(), endExclusive: endExclusive.toISOString() };
}
