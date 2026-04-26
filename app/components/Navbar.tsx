"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavbarControls from "./NavbarControls";
import ConnectionStatus from "./ConnectionStatus";
import { useSettings } from "../contexts/SettingsContext";

export default function Navbar() {
  const { darkMode, displayMode, setDisplayMode } = useSettings();
  const pathname = usePathname();

  return (
    <nav
      className={`shadow-lg border-b sticky top-0 z-50 backdrop-blur-sm transition-colors duration-300 ${
        darkMode
          ? "bg-gray-900 border-gray-700"
          : "bg-[#014167] border-[#E55143]/30"
      }`}
    >
      <div className="container mx-auto px-3">
        <div className="flex justify-between items-center h-14">
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 hover:opacity-90 transition-opacity group min-w-0"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-[#E55143] backdrop-blur-sm rounded-lg flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform glow-hover">
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 text-white shrink-0"
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
              <div className="text-base sm:text-lg font-bold text-[#FDFCDF] drop-shadow-sm flex items-center gap-1 sm:gap-2">
                <span className="whitespace-nowrap shrink-0">ER Consult</span>
                <ConnectionStatus />
              </div>
              <div
                className={`text-[10px] sm:text-xs leading-none sm:leading-tight mt-0.5 sm:mt-0 font-medium ${
                  darkMode ? "text-gray-400" : "text-[#C7CFDA]"
                }`}
              >
                MNRH
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <NavbarControls />
            <Link
              href="/"
              className={`font-semibold p-1.5 sm:py-2 sm:px-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-1.5 text-sm glow-hover ${
                darkMode
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600"
                  : "bg-[#C7CFDA] hover:bg-[#C7CFDA]/80 text-[#014167] border border-[#014167]/30"
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="hidden lg:inline whitespace-nowrap">
                หน้าแรก
              </span>
            </Link>
            <Link
              href="/completed"
              className={`font-semibold p-1.5 sm:py-2 sm:px-4 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 text-sm glow-hover ${
                darkMode
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600"
                  : "bg-[#C7CFDA] hover:bg-[#C7CFDA]/80 text-[#014167] border border-[#014167]/30"
              }`}
            >
              <svg
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
            </Link>
            <Link
              href="/submit"
              className="bg-[#699D5D] hover:shadow-lg text-[#FDFCDF] font-bold p-1.5 sm:py-2 sm:px-4 rounded-lg shadow-md transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 text-sm glow-hover"
            >
              <svg
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
