"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavbarControls from "./NavbarControls";
import ConnectionStatus from "./ConnectionStatus";
import ConfirmModal from "./ConfirmModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutAttemptRef = useRef(false);

  const isHome = pathname === "/";
  const isCompleted = pathname === "/completed";
  const isSubmit = pathname === "/submit";

  const navLinkBase =
    "relative font-medium p-1.5 sm:py-2 sm:px-3 rounded-[6px] transition-colors duration-200 items-center justify-center gap-1.5 text-sm whitespace-nowrap";

  const navLinkActive = "bg-paper-3 text-ink border border-rule-2";

  const navLinkInactive =
    "text-muted hover:bg-paper-3/60 hover:text-ink border border-transparent";

  return (
    <nav className="bg-paper-2 border-b border-rule sticky top-0 z-50 transition-colors duration-200">
      <div className="container mx-auto px-3">
        <div className="flex justify-between items-center h-14 gap-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 hover:opacity-90 transition-opacity group min-w-0"
          >
            <div className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 bg-bad rounded-[6px] flex items-center justify-center border border-bad transition-transform group-hover:-translate-y-0.5">
              <svg
                aria-hidden="true"
                className="w-4 h-4 sm:w-5 sm:h-5 text-paper shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="text-xs sm:text-base font-medium text-ink flex items-center gap-1 sm:gap-2 min-w-0">
                <span className="whitespace-nowrap shrink-0">ER Consult</span>
                <ConnectionStatus />
              </div>
              <div className="text-[11px] leading-tight font-medium text-muted measured">
                MNRH
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <NavbarControls />

            {/* Divider — desktop navigation only (mobile/tablet uses BottomNav below lg) */}
            <div className="hidden lg:block w-px h-6 mx-0.5 bg-rule" />

            <Link
              href="/"
              aria-label="หน้าแรก"
              className={`hidden lg:flex ${navLinkBase} ${isHome ? navLinkActive : navLinkInactive}`}
              aria-current={isHome ? "page" : undefined}
            >
              <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="whitespace-nowrap">
                หน้าแรก
              </span>
              {isHome && (
                <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-accent rounded-full" />
              )}
            </Link>
            <Link
              href="/completed"
              aria-label="จัดการเคส"
              className={`hidden lg:flex ${navLinkBase} ${isCompleted ? navLinkActive : navLinkInactive}`}
              aria-current={isCompleted ? "page" : undefined}
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
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
              <span className="whitespace-nowrap">
                จัดการเคส
              </span>
              {isCompleted && (
                <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-cool rounded-full" />
              )}
            </Link>
            <Link
              href="/submit"
              aria-label="ส่งเคสปรึกษา"
              className={`hidden lg:flex relative bg-accent hover:opacity-90 text-accent-ink font-medium py-2 px-3.5 rounded-[6px] transition-opacity items-center justify-center gap-1.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ${
                isSubmit ? "ring-2 ring-focus ring-offset-2 ring-offset-paper-2" : ""
              }`}
              aria-current={isSubmit ? "page" : undefined}
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
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
              <span className="whitespace-nowrap">
                ส่งเคสปรึกษา
              </span>
            </Link>

            {user && (
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                aria-label="ออกจากระบบ"
                title="ออกจากระบบและล้างแคชในเครื่อง"
                className="p-1.5 sm:p-2 rounded-[6px] font-medium border transition-colors duration-200 flex items-center gap-1.5 bg-paper-3 text-ink-2 border-rule hover:border-bad/50 hover:text-bad hover:bg-bad-soft tap-feedback"
              >
                <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden xl:inline text-xs whitespace-nowrap">ออกจากระบบ</span>
              </button>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="ออกจากระบบ"
        message="คุณต้องการออกจากระบบและล้างแคชข้อมูลผู้ป่วยในเครื่องนี้หรือไม่?"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        variant="warning"
        confirmDisabled={isLoggingOut}
        onConfirm={() => {
          if (logoutAttemptRef.current) return;
          logoutAttemptRef.current = true;
          setIsLoggingOut(true);
          void (async () => {
            try {
              await logout();
              setShowLogoutConfirm(false);
            } catch (error) {
              addToast({
                type: "error",
                message:
                  error instanceof Error
                    ? `ออกจากระบบไม่สำเร็จ: ${error.message}`
                    : "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
                duration: 5000,
              });
            } finally {
              logoutAttemptRef.current = false;
              setIsLoggingOut(false);
            }
          })();
        }}
        onCancel={() => {
          if (logoutAttemptRef.current) return;
          setShowLogoutConfirm(false);
        }}
      />
    </nav>
  );
}
