"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "../contexts/SettingsContext";
import { useEffect, useState } from "react";
import { subscribeToConsultsByStatus } from "@/lib/db";

export default function BottomNav() {
  const pathname = usePathname();
  const { darkMode } = useSettings();
  const [pendingCount, setPendingCount] = useState(0);

  // Subscribe to pending count for badge
  useEffect(() => {
    const unsubscribe = subscribeToConsultsByStatus(
      "pending",
      (data) => setPendingCount(data.length),
      () => {} // silently ignore errors for badge
    );
    return () => unsubscribe();
  }, []);

  const isHome = pathname === "/";
  const isSubmit = pathname === "/submit";
  const isCompleted = pathname === "/completed";

  return (
    <nav
      className={`lg:hidden fixed bottom-0 left-0 right-0 border-t shadow-2xl z-50 backdrop-blur-md transition-colors duration-300 ${
        darkMode
          ? "bg-gray-900/95 border-gray-700"
          : "bg-[#014167]/95 border-[#E55143]/30"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex justify-around items-center h-16 px-2">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all group relative ${
            isHome 
              ? darkMode ? "bg-white/10" : "bg-white/15" 
              : "hover:bg-white/10"
          }`}
          aria-current={isHome ? "page" : undefined}
        >
          {/* Active top accent */}
          {isHome && (
            <span className="absolute -top-[1px] left-3 right-3 h-[2px] bg-[#E55143] rounded-full" />
          )}
          <div className="relative">
            <svg
              className={`w-6 h-6 transition-all duration-200 ${
                isHome
                  ? "text-[#E55143] scale-110"
                  : "text-[#FDFCDF]/60 group-hover:text-[#FDFCDF]"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-[#E55143] text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shadow-md animate-pulse">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
          <span
            className={`text-xs font-semibold transition-all duration-200 ${
              isHome
                ? "text-[#E55143]"
                : "text-[#FDFCDF]/60 group-hover:text-[#FDFCDF]"
            }`}
          >
            หน้าแรก
          </span>
        </Link>
        <Link
          href="/submit"
          className={`flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all group relative ${
            isSubmit 
              ? "bg-[#699D5D]/20"
              : "hover:bg-white/10"
          }`}
          aria-current={isSubmit ? "page" : undefined}
        >
          {isSubmit && (
            <span className="absolute -top-[1px] left-3 right-3 h-[2px] bg-[#699D5D] rounded-full" />
          )}
          <div className="relative">
            <svg
              className={`w-6 h-6 transition-all duration-200 ${
                isSubmit
                  ? "text-[#699D5D] scale-110"
                  : "text-[#699D5D]/60 group-hover:text-[#699D5D] group-hover:scale-110"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <span
            className={`text-xs font-bold transition-all duration-200 ${
              isSubmit
                ? "text-[#699D5D]"
                : "text-[#699D5D]/60 group-hover:text-[#699D5D]"
            }`}
          >
            ส่งเคส
          </span>
        </Link>
        <Link
          href="/completed"
          className={`flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all group relative ${
            isCompleted 
              ? darkMode ? "bg-white/10" : "bg-white/15" 
              : "hover:bg-white/10"
          }`}
          aria-current={isCompleted ? "page" : undefined}
        >
          {isCompleted && (
            <span className="absolute -top-[1px] left-3 right-3 h-[2px] bg-[#C7CFDA] rounded-full" />
          )}
          <svg
            className={`w-6 h-6 transition-all duration-200 ${
              isCompleted
                ? "text-[#FDFCDF] scale-110"
                : "text-[#FDFCDF]/60 group-hover:text-[#FDFCDF]"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
          <span
            className={`text-xs font-semibold transition-all duration-200 ${
              isCompleted
                ? "text-[#FDFCDF]"
                : "text-[#FDFCDF]/60 group-hover:text-[#FDFCDF]"
            }`}
          >
            จัดการ
          </span>
        </Link>
      </div>
    </nav>
  );
}
