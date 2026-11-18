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
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-paper transition-colors duration-200">
      <div className="max-w-md w-full bg-paper-2 border border-bad/40 rounded-[10px] p-6 text-center slide-in">
        <div className="w-14 h-14 bg-bad-soft border border-bad/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg aria-hidden="true" className="w-7 h-7 text-bad" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-medium text-ink mb-2">
          เกิดข้อผิดพลาดในการโหลดหน้าเว็บ
        </h2>
        <p className="text-sm text-ink-2 mb-6 break-words">
          ระบบไม่สามารถประมวลผลข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="w-full font-medium py-2.5 px-4 rounded-[6px] transition-opacity duration-200 text-sm flex items-center justify-center gap-2 bg-bad text-paper hover:opacity-90 whitespace-nowrap tap-feedback"
        >
          <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  );
}
