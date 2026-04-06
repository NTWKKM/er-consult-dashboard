/**
 * Helper to get the UTC ISO range [start, endExclusive) for a given local "YYYY-MM-DD" date.
 * Computes the offset for the target date itself to handle DST correctly.
 */
export function getUtcRangeForLocalDate(date: string, explicitOffset?: number) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) throw new Error('Invalid date format. Expected "YYYY-MM-DD".');

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    // Calendar-date validation to catch impossible dates like February 30th or April 31st
    const normalized = new Date(year, month - 1, day);
    if (
      normalized.getFullYear() !== year ||
      normalized.getMonth() !== month - 1 ||
      normalized.getDate() !== day
    ) {
      throw new Error(`Invalid calendar date: ${date}`);
    }

    // If explicitOffset is provided, use it for both start and end to test specific TZ behaviors.
    // Otherwise, compute per-date offsets to handle DST transitions.
    const offsetStart = explicitOffset !== undefined ? explicitOffset : new Date(year, month - 1, day).getTimezoneOffset();
    const offsetEnd = explicitOffset !== undefined ? explicitOffset : new Date(year, month - 1, day + 1).getTimezoneOffset();

    const start = new Date(Date.UTC(year, month - 1, day, 0, offsetStart));
    const endExclusive = new Date(Date.UTC(year, month - 1, day + 1, 0, offsetEnd));
    return { start: start.toISOString(), endExclusive: endExclusive.toISOString() };
}
