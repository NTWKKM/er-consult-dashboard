"use client";

import { useEffect } from "react";
import "./globals.css"; // Ensure standard Tailwind classes are loaded

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Layout Error caught by global-error.tsx:", error);
  }, [error]);

  return (
    <html lang="th" suppressHydrationWarning>
      <body className="font-sans bg-[#014167] dark:bg-gray-900 min-h-screen transition-colors duration-300 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#C7CFDA] dark:bg-gray-800 border border-[#E55143]/50 dark:border-[#E55143]/30 rounded-xl shadow-2xl p-6 md:p-8 text-center slide-in">
          <div className="w-20 h-20 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <svg className="w-10 h-10 text-[#E55143]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#014167] dark:text-gray-100 mb-3 drop-shadow-sm">
            ข้อผิดพลาดร้ายแรงของระบบ
          </h1>
          <p className="text-sm text-[#014167]/80 dark:text-gray-300 mb-8 font-medium bg-white/50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-300 dark:border-gray-700 break-words">
            {error.message || "เกิดข้อผิดพลาดในโครงสร้างหลักของแอปพลิเคชัน กรุณารีเฟรชหน้าเว็บหรือติดต่อผู้ดูแลระบบ"}
          </p>
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="w-full font-bold py-3 px-4 rounded-lg transition-all duration-200 shadow-md text-sm flex items-center justify-center gap-2 bg-[#014167] dark:bg-gray-700 text-white hover:bg-[#012a47] dark:hover:bg-gray-600 border border-transparent dark:border-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            โหลดหน้าแรกใหม่ (Reload App)
          </button>
        </div>
      </body>
    </html>
  );
}
