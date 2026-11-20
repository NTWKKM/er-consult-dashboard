"use client";

import React, { useState, useEffect } from "react";

interface ElapsedTimeProps {
  createdAt: string;
}

/**
 * Returns the CSS class for elapsed time color escalation.
 * < 90 => elapsed-safe, 90–150 => elapsed-warning, 151–240 => elapsed-danger, >240 => elapsed-critical
 */
function getElapsedClass(totalMinutes: number): string {
  if (totalMinutes < 90) return "elapsed-safe";
  if (totalMinutes <= 150) return "elapsed-warning";
  return totalMinutes > 240 ? "elapsed-critical" : "elapsed-danger";
}

function getElapsedState(createdAt: string) {
  const createdMs = new Date(createdAt).getTime();
  const mins = Number.isFinite(createdMs)
    ? Math.max(0, Math.floor((Date.now() - createdMs) / 60000))
    : 0;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;

  return {
    mins,
    text: hrs > 0 ? `${hrs} ชม. ${remainMins} นาที` : `${remainMins} นาที`,
  };
}

/**
 * Component to display the elapsed time since a consult was created.
 * Updates every minute and uses Thai locale for time units.
 * Color escalates based on wait duration for urgency awareness.
 */
export const ElapsedTime = React.memo(function ElapsedTime({ createdAt }: ElapsedTimeProps) {
  // Minute tick forces recalculation on each minute boundary while prop changes (e.g., Re-consult)
  // immediately reflect the fresh createdAt on the very next render.
  const [, setTick] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const bump = () => setTick((t) => t + 1);

    // Calculate ms until the next minute boundary
    const createdMs = new Date(createdAt).getTime();
    const elapsedMs = Number.isFinite(createdMs) ? Math.max(0, Date.now() - createdMs) : 0;
    const msUntilNextMinute = 60000 - (elapsedMs % 60000 || 60000);

    const timeout = setTimeout(() => {
      bump();
      interval = setInterval(bump, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [createdAt]);

  const { mins: totalMins, text: elapsed } = getElapsedState(createdAt);
  const escalationClass = getElapsedClass(totalMins);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-medium measured tracking-tight whitespace-nowrap shrink-0 ${escalationClass}`}
    >
      <svg aria-hidden="true" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      รอ {elapsed}
    </span>
  );
});
