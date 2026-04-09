"use client";

import React, { useState, useEffect } from "react";

interface ElapsedTimeProps {
  createdAt: string;
  darkMode: boolean;
}

/**
 * Component to display the elapsed time since a consult was created.
 * Updates every minute and uses Thai locale for time units.
 */
export const ElapsedTime = React.memo(function ElapsedTime({ createdAt, darkMode }: ElapsedTimeProps) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(createdAt).getTime();
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;

      if (hrs > 0) {
        setElapsed(`${hrs} ชม. ${remainMins} นาที`);
      } else {
        setElapsed(`${remainMins} นาที`);
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold elapsed-tick ${
        darkMode ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/15 text-amber-700"
      }`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      รอ {elapsed}
    </span>
  );
});
