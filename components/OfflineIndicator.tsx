"use client";

import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useEffect, useState } from "react";

export default function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const [show, setShow] = useState(!isOnline);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
    } else {
      // Hide after a brief moment when coming back online
      const timer = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div 
        className={`px-4 py-2 rounded-full backdrop-blur-md border shadow-lg flex items-center space-x-2 transition-colors duration-300 ${
          isOnline 
            ? "bg-green-500/20 border-green-500/30 text-green-700 dark:text-green-300" 
            : "bg-red-500/20 border-red-500/30 text-red-700 dark:text-red-300"
        }`}
      >
        <span className="relative flex h-3 w-3">
          {!isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? "bg-green-500" : "bg-red-500"}`}></span>
        </span>
        <span className="text-sm font-medium">
          {isOnline ? "Connected (Syncing...)" : "Offline (Changes saved locally)"}
        </span>
      </div>
    </div>
  );
}
