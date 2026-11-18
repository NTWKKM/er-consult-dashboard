"use client";

import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useEffect, useRef, useState } from "react";

export default function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const [show, setShow] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShow(true);
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShow(true);
      // Hide after a brief moment when coming back online
      const timer = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div 
        className={`px-4 py-1.5 rounded-full border flex items-center gap-2 transition-colors duration-200 ${
          isOnline 
            ? "bg-ok-soft border-ok/40 text-ok" 
            : "bg-bad-soft border-bad/40 text-bad"
        }`}
      >
        <span className="relative flex h-2.5 w-2.5">
          {!isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bad opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? "bg-ok" : "bg-bad"}`}></span>
        </span>
        <span className="text-xs font-medium">
          {isOnline ? "Connected (Syncing…)" : "Offline (Changes saved locally)"}
        </span>
      </div>
    </div>
  );
}
