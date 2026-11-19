import type { ReactNode } from "react";
import type { Consult, ConsultDepartment, ConsultTransfer } from "./db";

/**
 * Helper for formatting status times in Thai locale
 */
export const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
};

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

interface Milestone {
  label: string;
  time: string | null;
  raw: string | null | undefined;
  icon?: string | ReactNode;
}

/**
 * Generate the full chronological list of milestones for a department, including transfers.
 */
export function getAllMilestones(dept: ConsultDepartment | undefined, formatTime: (iso: string) => string | null): Milestone[] {
  const milestones: Milestone[] = [
    { 
      label: "รับ", 
      time: dept?.acceptedAt ? formatTime(dept.acceptedAt) : null, 
      raw: dept?.acceptedAt, 
      icon: "check"
    },
    { 
      label: "Admit", 
      time: dept?.admittedAt ? formatTime(dept.admittedAt) : null, 
      raw: dept?.admittedAt, 
    },
    { 
      label: "คืน ER", 
      time: dept?.returnedAt ? formatTime(dept.returnedAt) : null, 
      raw: dept?.returnedAt, 
    },
    { 
      label: "D/C", 
      time: dept?.dischargedAt ? formatTime(dept.dischargedAt) : null, 
      raw: dept?.dischargedAt, 
    },
  ];

  // Add transfer milestones
  const transferMilestones: Milestone[] = (dept?.transfers || []).map((t: ConsultTransfer) => ({
    label: `ย้าย ${t.to}`,
    time: t.at ? formatTime(t.at) : null,
    raw: t.at,
    icon: "transfer"
  }));

  const allFiltered = [...milestones, ...transferMilestones].filter((m): m is Milestone => !!(m.time && m.raw));

  // Sort chronologically (oldest first)
  return [...allFiltered].sort((a, b) => new Date(a.raw!).getTime() - new Date(b.raw!).getTime());
}

/**
 * Generate a list of chronological milestones for a department, including transfers.
 * Returns up to 3 most recent milestones for space-sensitive UIs.
 */
export function getMilestones(dept: ConsultDepartment | undefined, formatTime: (iso: string) => string|null) {
  return getAllMilestones(dept, formatTime).slice(-3);
}
