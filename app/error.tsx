"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service if available
    console.error("Page Level Error caught by error.tsx:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 transition-colors duration-300">
      <div className="max-w-md w-full bg-[#C7CFDA] dark:bg-gray-800 border border-[#E55143]/30 dark:border-gray-700 rounded-xl shadow-lg p-6 text-center slide-in">
        <div className="w-16 h-16 bg-[#E55143]/10 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#E55143]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#014167] dark:text-gray-100 mb-2">
          เกิดข้อผิดพลาดในการโหลดหน้าเว็บ
        </h2>
        <p className="text-sm text-[#014167]/80 dark:text-gray-300 mb-6 font-medium">
          {error.message || "ระบบไม่สามารถประมวลผลข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"}
        </p>
        <button
          onClick={() => reset()}
          className="w-full font-bold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-sm text-sm flex items-center justify-center gap-2 bg-[#E55143] text-white hover:shadow-md transform hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          ลองใหม่อีกครั้ง (Try Again)
        </button>
      </div>
    </div>
  );
}
