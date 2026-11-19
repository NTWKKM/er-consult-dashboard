"use client";

import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useEffect, useRef, useState } from "react";

export default function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      const showTimer = setTimeout(() => setShowReconnected(true), 0);
      // Hide after a brief moment when coming back online
      const hideTimer = setTimeout(() => setShowReconnected(false), 3000);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-fade-in"
    >
      <div 
        className={`px-4 py-1.5 rounded-full border flex items-center gap-2 transition-colors duration-200 ${
          isOnline 
            ? "bg-ok-soft border-ok/40 text-ok" 
            : "bg-bad-soft border-bad/40 text-bad"
        }`}
      >
        <span className="relative flex h-2.5 w-2.5">
          {!isOnline && <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-bad opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? "bg-ok" : "bg-bad"}`}></span>
        </span>
        <span className="text-xs font-medium whitespace-nowrap">
          {isOnline ? "กลับมาเชื่อมต่อแล้ว (กำลังซิงค์…)" : "ออฟไลน์ (การเปลี่ยนแปลงจะซิงค์เมื่อกลับมาออนไลน์)"}
        </span>
      </div>
    </div>
  );
}
