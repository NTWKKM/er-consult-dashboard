import type { Consult } from "./db";

/**
 * Sort consults by urgency first (urgent cases on top), then by creation date (newest first).
 * Single source of truth for consult ordering — use this everywhere instead of inline sorts.
 */
export function sortConsults(consults: Consult[]): Consult[] {
  return [...consults].sort((a, b) => {
    if (a.isUrgent && !b.isUrgent) return -1;
    if (!a.isUrgent && b.isUrgent) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Find new case IDs that were not present in the previous set.
 * Used for accurate new-case detection (instead of checking count only).
 */
export function findNewCaseIds(
  currentIds: Set<string>,
  previousIds: Set<string>
): string[] {
  const newIds: string[] = [];
  currentIds.forEach((id) => {
    if (!previousIds.has(id)) {
      newIds.push(id);
    }
  });
  return newIds;
}
