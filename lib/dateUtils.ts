/**
 * Helper to get the UTC ISO range [start, end) for a given local "YYYY-MM-DD" date.
 * Computes the offset for the target date itself to handle DST correctly.
 */
export function getUtcRangeForLocalDate(date: string) {
    const [year, month, day] = date.split("-").map(Number);

    // Compute offsets per-date to handle DST transitions correctly
    const offsetStart = new Date(year, month - 1, day).getTimezoneOffset();
    const offsetEnd = new Date(year, month - 1, day + 1).getTimezoneOffset();

    const start = new Date(Date.UTC(year, month - 1, day, 0, offsetStart));
    const end = new Date(Date.UTC(year, month - 1, day + 1, 0, offsetEnd));
    return { start: start.toISOString(), end: end.toISOString() };
}
