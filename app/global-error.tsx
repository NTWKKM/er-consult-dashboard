"use client";

import { useEffect } from "react";
import "./globals.css"; // Ensure standard Tailwind classes are loaded

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Layout Error caught by global-error.tsx:", error);
    try {
      const isDark = window.localStorage.getItem("darkMode") === "true";
      document.documentElement.classList.toggle("dark", isDark);
    } catch {
      // Ignore storage access errors in error boundary
    }
  }, [error]);

  return (
    <html lang="th" suppressHydrationWarning>
      <body className="bg-paper text-ink min-h-screen transition-colors duration-200 flex items-center justify-center p-4">
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="max-w-md w-full bg-paper-2 border border-bad/40 rounded-[10px] p-6 md:p-8 text-center slide-in"
        >
          <div className="w-16 h-16 bg-bad-soft border border-bad/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg aria-hidden="true" className="w-8 h-8 text-bad" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-medium text-ink mb-3">
            ข้อผิดพลาดร้ายแรงของระบบ
          </h1>
          <p className="text-sm text-ink-2 mb-8 bg-paper-3 p-3 rounded-[6px] border border-rule break-words">
            เกิดข้อผิดพลาดในโครงสร้างหลักของแอปพลิเคชัน กรุณาลองใหม่ รีเฟรชหน้าเว็บ หรือติดต่อผู้ดูแลระบบ
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => reset()}
              className="flex-1 font-medium py-3 px-4 rounded-[6px] transition-colors duration-200 text-sm flex items-center justify-center gap-2 bg-paper-3 border border-rule-2 text-ink hover:border-ink-2 whitespace-nowrap tap-feedback"
            >
              ลองใหม่
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="flex-1 font-medium py-3 px-4 rounded-[6px] transition-opacity duration-200 text-sm flex items-center justify-center gap-2 bg-accent text-accent-ink hover:opacity-90 whitespace-nowrap tap-feedback"
            >
              <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              โหลดหน้านี้ใหม่
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
