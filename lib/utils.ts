import type { Consult, ConsultDepartment, ConsultTransfer } from "./db";

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

export interface Milestone {
  label: string;
  time: string | null;
  raw: string | null | undefined;
  color: string;
  icon?: string | React.ReactNode;
}

/**
 * Generate a list of chronological milestones for a department, including transfers.
 * Returns up to 3 most recent milestones for space-sensitive UIs.
 */
export function getMilestones(dept: ConsultDepartment, formatTime: (iso: string) => string|null) {
  const milestones: Milestone[] = [
    { 
      label: "รับ", 
      time: dept?.acceptedAt ? formatTime(dept.acceptedAt) : null, 
      raw: dept?.acceptedAt, 
      color: "text-[#699D5D]",
      icon: "check"
    },
    { 
      label: "Admit", 
      time: dept?.admittedAt ? formatTime(dept.admittedAt) : null, 
      raw: dept?.admittedAt, 
      color: "text-blue-600 dark:text-blue-400" 
    },
    { 
      label: "คืน ER", 
      time: dept?.returnedAt ? formatTime(dept.returnedAt) : null, 
      raw: dept?.returnedAt, 
      color: "text-amber-600 dark:text-amber-400" 
    },
    { 
      label: "D/C", 
      time: dept?.dischargedAt ? formatTime(dept.dischargedAt) : null, 
      raw: dept?.dischargedAt, 
      color: "text-purple-600 dark:text-purple-400" 
    },
  ];

  // Add transfer milestones
  const transferMilestones: Milestone[] = (dept?.transfers || []).map((t: ConsultTransfer) => ({
    label: `ย้าย ${t.to}`,
    time: formatTime(t.at),
    raw: t.at,
    color: "text-blue-500",
    icon: "transfer"
  }));

  const allFiltered = [...milestones, ...transferMilestones].filter((m): m is Milestone => !!(m.time && m.raw));

  // Sort by raw timestamp descending to find latest 3
  const latest3 = [...allFiltered]
    .sort((a, b) => new Date(b.raw!).getTime() - new Date(a.raw!).getTime())
    .slice(0, 3);

  // Return back in chronological order
  return allFiltered.filter(m => latest3.includes(m));
}
