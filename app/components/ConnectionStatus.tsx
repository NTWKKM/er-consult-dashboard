"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export default function ConnectionStatus() {
  const isOnline = useSyncExternalStore<boolean | null>(
    subscribe,
    () => navigator.onLine,
    () => null
  );

  // Dot and label derived from confirmed state
  const dotColor = isOnline === null ? 'bg-muted' : isOnline ? 'bg-ok' : 'bg-bad';
  const label = isOnline === null ? '...' : isOnline ? 'LIVE' : 'OFFLINE';

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border bg-paper-3 border-rule backdrop-blur-sm ml-1 min-w-0 overflow-hidden">
      <span className="relative flex h-2 w-2 shrink-0">
        {isOnline === true && <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75"></span>}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
      </span>
      <span className="text-[10px] font-medium text-ink-2 measured tracking-wide truncate">{label}</span>
    </div>
  );
}
