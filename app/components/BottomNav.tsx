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

  return (
    <nav
      className={`lg:hidden fixed bottom-0 left-0 right-0 border-t shadow-2xl z-50 backdrop-blur-sm transition-colors duration-300 ${
        darkMode
          ? "bg-gray-900 border-gray-700"
          : "bg-[#014167] border-[#E55143]/30"
      }`}
    >
      <div className="flex justify-around items-center h-16 px-2">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all group relative ${
            pathname === "/" ? "bg-[#E55143]/30" : "hover:bg-[#E55143]/20"
          }`}
        >
          <div className="relative">
            <svg
              className={`w-6 h-6 transition-colors ${
                pathname === "/"
                  ? "text-[#E55143]"
                  : "text-[#FDFCDF] group-hover:text-[#E55143]"
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
            className={`text-xs font-medium transition-colors ${
              pathname === "/"
                ? "text-[#E55143]"
                : "text-[#FDFCDF] group-hover:text-[#E55143]"
            }`}
          >
            หน้าแรก
          </span>
        </Link>
        <Link
          href="/submit"
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all group ${
            pathname === "/submit"
              ? "bg-[#699D5D]/30"
              : "hover:bg-[#699D5D]/20"
          }`}
        >
          <div className="relative">
            <svg
              className={`w-6 h-6 transition-transform ${
                pathname === "/submit"
                  ? "text-[#699D5D] scale-110"
                  : "text-[#699D5D] group-hover:scale-110"
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
            {pathname !== "/submit" && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#E55143] rounded-full animate-pulse"></div>
            )}
          </div>
          <span
            className={`text-xs font-bold transition-transform ${
              pathname === "/submit"
                ? "text-[#699D5D] scale-105"
                : "text-[#699D5D] group-hover:scale-105"
            }`}
          >
            ส่งเคส
          </span>
        </Link>
        <Link
          href="/completed"
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all group ${
            pathname === "/completed"
              ? "bg-[#C7CFDA]/30"
              : "hover:bg-[#C7CFDA]/20"
          }`}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              pathname === "/completed"
                ? "text-[#C7CFDA]"
                : "text-[#FDFCDF] group-hover:text-[#C7CFDA]"
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
            className={`text-xs font-medium transition-colors ${
              pathname === "/completed"
                ? "text-[#C7CFDA]"
                : "text-[#FDFCDF] group-hover:text-[#C7CFDA]"
            }`}
          >
            จัดการ
          </span>
        </Link>
      </div>
    </nav>
  );
}
