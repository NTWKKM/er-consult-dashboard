"use client";

import React, { useId, useState } from "react";
import type { ConsultDepartment } from "@/lib/db";
import { getAllMilestones, formatTime } from "@/lib/utils";

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
 * Shows up to 3 most recent milestones inline with an expandable +N disclosure button when older milestones exist.
 * Shared between ConsultCard and Dashboard table DepartmentActionPanel.
 */
export function MilestoneList({ dept, isAccepted, variant = "inline" }: MilestoneListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const trailPanelId = useId();
  const fullMilestones = getAllMilestones(dept, formatTime);
  const eligibleMilestones = isAccepted
    ? fullMilestones
    : fullMilestones.filter((m) => m.icon === "transfer");

  if (eligibleMilestones.length === 0) return null;

  const hiddenCount = Math.max(0, eligibleMilestones.length - 3);
  const milestonesToRender = eligibleMilestones.slice(-3);
  const fullTrailSummary = eligibleMilestones
    .map((m) => `${m.label} ${m.time}`)
    .join(" → ");

  const wrapperClass =
    variant === "bordered"
      ? "pt-1 border-t border-rule"
      : "";

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] measured">
        {hiddenCount > 0 && (
          <>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              aria-controls={trailPanelId}
              title={`ประวัติทั้งหมด: ${fullTrailSummary}`}
              aria-label={`+${hiddenCount} ดูประวัติก่อนหน้าทั้งหมด (${eligibleMilestones.length} รายการ)`}
              className="px-1.5 py-0.5 rounded-[4px] bg-paper-3 border border-rule text-muted hover:text-ink hover:border-rule-2 text-[10px] font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              +{hiddenCount}
            </button>
            <span className="text-muted text-[10px]">•</span>
          </>
        )}
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
      {hiddenCount > 0 && isExpanded && (
        <div
          id={trailPanelId}
          role="region"
          aria-label="ประวัติขั้นตอนทั้งหมด"
          className="mt-1.5 px-2 py-1.5 rounded-[6px] bg-paper-3 border border-rule text-[10px] text-ink-2 measured break-words"
        >
          <span className="text-muted font-medium mr-1">ประวัติทั้งหมด:</span>
          {fullTrailSummary}
        </div>
      )}
    </div>
  );
}
