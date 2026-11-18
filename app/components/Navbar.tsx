"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavbarControls from "./NavbarControls";
import ConnectionStatus from "./ConnectionStatus";

export default function Navbar() {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isCompleted = pathname === "/completed";
  const isSubmit = pathname === "/submit";

  const navLinkBase =
    "relative font-medium p-1.5 sm:py-2 sm:px-3 rounded-[6px] transition-colors duration-200 flex items-center justify-center gap-1.5 text-sm whitespace-nowrap";

  const navLinkActive = "bg-paper-3 text-ink border border-rule-2";

  const navLinkInactive =
    "text-muted hover:bg-paper-3/60 hover:text-ink border border-transparent";

  return (
    <nav className="bg-paper-2 border-b border-rule sticky top-0 z-50 transition-colors duration-200">
      <div className="container mx-auto px-3">
        <div className="flex justify-between items-center h-14">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity group min-w-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 bg-bad rounded-[6px] flex items-center justify-center border border-bad transition-transform group-hover:-translate-y-0.5">
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
              <div className="text-sm sm:text-base font-medium text-ink flex items-center gap-1 sm:gap-2">
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

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 mx-0.5 bg-rule" />

            <Link
              href="/"
              className={`${navLinkBase} ${isHome ? navLinkActive : navLinkInactive}`}
              aria-current={isHome ? "page" : undefined}
            >
              <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="hidden lg:inline whitespace-nowrap">
                หน้าแรก
              </span>
              {isHome && (
                <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-accent rounded-full" />
              )}
            </Link>
            <Link
              href="/completed"
              className={`${navLinkBase} ${isCompleted ? navLinkActive : navLinkInactive}`}
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
              <span className="hidden sm:inline whitespace-nowrap">
                จัดการเคส
              </span>
              {isCompleted && (
                <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-cool rounded-full" />
              )}
            </Link>
            <Link
              href="/submit"
              className={`relative bg-accent hover:opacity-90 text-accent-ink font-medium p-1.5 sm:py-2 sm:px-3.5 rounded-[6px] transition-opacity flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
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
              <span className="hidden sm:inline whitespace-nowrap">
                ส่งเคสปรึกษา
              </span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
