"use client";

import { useState, useEffect } from "react";

export default function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Dot and label derived from confirmed state
  const dotColor = isOnline === null ? 'bg-gray-400' : isOnline ? 'bg-green-500' : 'bg-red-500';
  const label = isOnline === null ? '...' : isOnline ? 'LIVE' : 'OFFLINE';

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-white/10 border-white/20 shadow-sm backdrop-blur-sm ml-1">
      <span className="relative flex h-2 w-2">
        {isOnline === true && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
      </span>
      <span className="text-[10px] font-bold text-[#FDFCDF] tracking-wide">{label}</span>
    </div>
  );
}
