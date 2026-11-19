"use client";

import React from "react";
import type { ConsultDepartment } from "@/lib/db";
import { getMilestones, formatTime } from "@/lib/utils";

interface MilestoneListProps {
  dept: ConsultDepartment | undefined;
  /** When false, only transfer milestones are shown (pre-accept state). */
  isAccepted: boolean;
  /** Visual style: "inline" for ConsultCard, "bordered" for table DepartmentActionPanel. */
  variant?: "inline" | "bordered";
}

function getMilestoneTone(label: string): string {
  if (label === "รับ") return "text-ok";
  if (label === "คืน ER") return "text-accent";
  return "text-cool";
}

/**
 * Renders chronological department milestones (Accept, Admit, คืน ER, D/C, Transfers).
 * Shared between ConsultCard and Dashboard table DepartmentActionPanel.
 */
export function MilestoneList({ dept, isAccepted, variant = "inline" }: MilestoneListProps) {
  const allMilestones = getMilestones(dept, formatTime);
  const milestonesToRender = isAccepted
    ? allMilestones
    : allMilestones.filter((m) => m.icon === "transfer");

  if (milestonesToRender.length === 0) return null;

  const containerClass =
    variant === "bordered"
      ? "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] measured pt-1 border-t border-rule"
      : "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] measured";

  return (
    <div className={containerClass}>
      {milestonesToRender.map((m, idx, arr) => (
        <React.Fragment key={`${m.label}-${m.raw}`}>
          <div className="flex items-center gap-1">
            {m.icon === "check" ? (
              <svg aria-hidden="true" className="w-3 h-3 text-ok shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : m.icon === "transfer" ? (
              <svg aria-hidden="true" className="w-3 h-3 text-cool shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : null}
            <span className={`font-medium whitespace-nowrap ${getMilestoneTone(m.label)}`}>
              {m.label} {m.time}
            </span>
          </div>
          {idx < arr.length - 1 && (
            <span className="text-muted text-[10px]">•</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
