"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { subscribeToConsultsByStatus } from "@/lib/db";

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  // Subscribe to pending count for mobile badge only when authenticated and viewport is below lg breakpoint
  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia?.("(max-width: 1023px)");
    let unsubscribe: (() => void) | null = null;

    const syncSubscription = () => {
      const isMobile = mediaQuery ? mediaQuery.matches : true;
      if (isMobile && !unsubscribe) {
        unsubscribe = subscribeToConsultsByStatus(
          "pending",
          (data) => setPendingCount(data.length),
          () => {} // silently ignore errors for badge
        );
      } else if (!isMobile && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    syncSubscription();
    mediaQuery?.addEventListener?.("change", syncSubscription);

    return () => {
      mediaQuery?.removeEventListener?.("change", syncSubscription);
      unsubscribe?.();
    };
  }, [user]);

  const isHome = pathname === "/";
  const isSubmit = pathname === "/submit";
  const isCompleted = pathname === "/completed";

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-paper-2 border-t border-rule z-50 transition-colors duration-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex justify-around items-center h-16 px-2 gap-1">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 px-3 sm:px-5 py-2 flex-1 max-w-[120px] rounded-[6px] transition-colors group relative ${
            isHome ? "bg-paper-3" : "hover:bg-paper-3/60"
          }`}
          aria-current={isHome ? "page" : undefined}
        >
          {isHome && (
            <span className="absolute -top-[1px] left-3 right-3 h-[2px] bg-accent rounded-full" />
          )}
          <div className="relative">
            <svg
              aria-hidden="true"
              className={`w-6 h-6 transition-transform duration-200 ${
                isHome
                  ? "text-accent scale-105"
                  : "text-muted group-hover:text-ink"
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
              <span className="absolute -top-1.5 -right-2.5 bg-bad text-paper text-[10px] font-medium measured min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
          <span
            className={`text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
              isHome ? "text-accent" : "text-muted group-hover:text-ink"
            }`}
          >
            หน้าแรก
          </span>
        </Link>
        <Link
          href="/submit"
          className={`flex flex-col items-center gap-1 px-3 sm:px-5 py-2 flex-1 max-w-[120px] rounded-[6px] transition-colors group relative ${
            isSubmit ? "bg-ok-soft" : "hover:bg-paper-3/60"
          }`}
          aria-current={isSubmit ? "page" : undefined}
        >
          {isSubmit && (
            <span className="absolute -top-[1px] left-3 right-3 h-[2px] bg-ok rounded-full" />
          )}
          <div className="relative">
            <svg
              aria-hidden="true"
              className={`w-6 h-6 transition-transform duration-200 ${
                isSubmit
                  ? "text-ok scale-105"
                  : "text-ok/80 group-hover:text-ok group-hover:scale-105"
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
            className={`text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
              isSubmit ? "text-ok" : "text-ok group-hover:text-ok"
            }`}
          >
            ส่งเคส
          </span>
        </Link>
        <Link
          href="/completed"
          className={`flex flex-col items-center gap-1 px-3 sm:px-5 py-2 flex-1 max-w-[120px] rounded-[6px] transition-colors group relative ${
            isCompleted ? "bg-paper-3" : "hover:bg-paper-3/60"
          }`}
          aria-current={isCompleted ? "page" : undefined}
        >
          {isCompleted && (
            <span className="absolute -top-[1px] left-3 right-3 h-[2px] bg-cool rounded-full" />
          )}
          <svg
            aria-hidden="true"
            className={`w-6 h-6 transition-transform duration-200 ${
              isCompleted
                ? "text-cool scale-105"
                : "text-muted group-hover:text-ink"
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
            className={`text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
              isCompleted ? "text-cool" : "text-muted group-hover:text-ink"
            }`}
          >
            จัดการ
          </span>
        </Link>
      </div>
    </nav>
  );
}
