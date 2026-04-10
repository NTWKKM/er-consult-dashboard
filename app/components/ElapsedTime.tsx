"use client";

import React, { useState, useEffect } from "react";

interface ElapsedTimeProps {
  createdAt: string;
}

/**
 * Returns the CSS class for elapsed time color escalation.
 * < 90 min = green (safe), 90-150 min = yellow (warning), > 150 min = red (danger/critical)
 */
function getElapsedClass(totalMinutes: number): string {
  if (totalMinutes < 90) return "elapsed-safe";
  if (totalMinutes <= 150) return "elapsed-warning";
  return totalMinutes > 240 ? "elapsed-critical" : "elapsed-danger";
}

/**
 * Component to display the elapsed time since a consult was created.
 * Updates every minute and uses Thai locale for time units.
 * Color escalates based on wait duration for urgency awareness.
 */
export const ElapsedTime = React.memo(function ElapsedTime({ createdAt }: ElapsedTimeProps) {
  const [elapsed, setElapsed] = useState("");
  const [totalMins, setTotalMins] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const update = () => {
      const createdMs = new Date(createdAt).getTime();
      const mins = Number.isFinite(createdMs)
        ? Math.max(0, Math.floor((Date.now() - createdMs) / 60000))
        : 0;
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;

      setTotalMins(mins);
      if (hrs > 0) {
        setElapsed(`${hrs} ชม. ${remainMins} นาที`);
      } else {
        setElapsed(`${remainMins} นาที`);
      }
    };

    update();
    
    // Calculate ms until the next minute boundary
    const createdMs = new Date(createdAt).getTime();
    const elapsedMs = Number.isFinite(createdMs) ? Math.max(0, Date.now() - createdMs) : 0;
    const msUntilNextMinute = 60000 - (elapsedMs % 60000 || 60000);

    const timeout = setTimeout(() => {
      update();
      interval = setInterval(update, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [createdAt]);

  const escalationClass = getElapsedClass(totalMins);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-tight ${escalationClass}`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      รอ {elapsed}
    </span>
  );
});
