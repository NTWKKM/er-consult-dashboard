"use client";

import { useSettings } from "../contexts/SettingsContext";

export default function NavbarControls() {
  const { soundEnabled, darkMode, toggleSound, toggleDarkMode } = useSettings();

  return (
    <>
      <button
        type="button"
        className={`p-1.5 sm:p-2 rounded-[6px] font-medium border transition-colors duration-200 flex items-center gap-1 tap-feedback ${
          soundEnabled
            ? "bg-ok text-paper border-ok"
            : "bg-paper-3 text-ink-2 border-rule hover:border-rule-2 hover:text-ink"
        }`}
        onClick={toggleSound}
        aria-pressed={soundEnabled}
        aria-label="เสียงแจ้งเตือน"
        title={soundEnabled ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
      >
        {soundEnabled ? (
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={`p-1.5 sm:p-2 rounded-[6px] font-medium border transition-colors duration-200 flex items-center gap-1 tap-feedback ${
          darkMode
            ? "bg-accent text-accent-ink border-accent"
            : "bg-paper-3 text-ink-2 border-rule hover:border-rule-2 hover:text-ink"
        }`}
        onClick={toggleDarkMode}
        aria-pressed={darkMode}
        aria-label="โหมดกลางคืน"
        title={darkMode ? "โหมดกลางวัน" : "โหมดกลางคืน"}
      >
        {darkMode ? (
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </>
  );
}
