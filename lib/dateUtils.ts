/**
 * Helper to get the UTC ISO range [start, end) for a given local "YYYY-MM-DD" date.
 * Accepts an optional offsetMinutes (positive for West, negative for East, same as Date.getTimezoneOffset())
 * to compute the UTC boundary correctly for the user's local day.
 * If not provided, computes the offset for the target date itself to handle DST correctly.
 */
export function getUtcRangeForLocalDate(date: string, offsetMinutes?: number) {
    const [year, month, day] = date.split("-").map(Number);

    // When an explicit offset is provided, use it directly (caller knows user's timezone).
    // Otherwise, fall back to server's local timezone for the target dates.
    const offsetStart = offsetMinutes ?? new Date(year, month - 1, day).getTimezoneOffset();
    const offsetEnd = offsetMinutes ?? new Date(year, month - 1, day + 1).getTimezoneOffset();

    const start = new Date(Date.UTC(year, month - 1, day, 0, offsetStart));
    const end = new Date(Date.UTC(year, month - 1, day + 1, 0, offsetEnd));
    return { start: start.toISOString(), end: end.toISOString() };
}
