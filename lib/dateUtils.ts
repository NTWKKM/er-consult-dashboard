/**
 * Fixed UTC offset in minutes for Asia/Bangkok (UTC+7, no DST).
 * Date.prototype.getTimezoneOffset() returns UTC - local, so UTC+7 is -420.
 */
export const BANGKOK_OFFSET_MIN = -420;

/**
 * Maximum inclusive calendar days permitted for Excel export queries.
 */
export const MAX_EXPORT_DAYS = 31;

function parseCalendarDate(date: string): { year: number; month: number; day: number } {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) throw new Error('Invalid date format. Expected "YYYY-MM-DD".');

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    // Calendar-date validation in UTC to catch impossible dates (Feb 30, Apr 31) independent of device TZ
    const normalized = new Date(Date.UTC(year, month - 1, day));
    if (
      normalized.getUTCFullYear() !== year ||
      normalized.getUTCMonth() !== month - 1 ||
      normalized.getUTCDate() !== day
    ) {
      throw new Error(`Invalid calendar date: ${date}`);
    }

    return { year, month, day };
}

/**
 * Helper to get the UTC ISO range [start, endExclusive) for a given "YYYY-MM-DD" date.
 * Defaults to Asia/Bangkok (UTC+7) so hospital queries never drift on non-Bangkok devices.
 */
export function getUtcRangeForLocalDate(date: string, explicitOffset: number = BANGKOK_OFFSET_MIN) {
    const { year, month, day } = parseCalendarDate(date);

    const start = new Date(Date.UTC(year, month - 1, day, 0, explicitOffset));
    const endExclusive = new Date(Date.UTC(year, month - 1, day + 1, 0, explicitOffset));
    return { start: start.toISOString(), endExclusive: endExclusive.toISOString() };
}

/**
 * Returns the inclusive number of calendar days between two "YYYY-MM-DD" dates.
 * For example, 2026-01-01 to 2026-01-31 is 31 days; 2026-01-01 to 2026-02-01 is 32 days.
 */
export function inclusiveDayCount(startDate: string, endDate: string): number {
    const start = parseCalendarDate(startDate);
    const end = parseCalendarDate(endDate);
    const startMs = Date.UTC(start.year, start.month - 1, start.day);
    const endMs = Date.UTC(end.year, end.month - 1, end.day);
    return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
}
