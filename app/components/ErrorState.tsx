import React from 'react';

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-paper">
      <div className="text-center bg-paper-2 rounded-[10px] p-8 max-w-md border border-bad/40">
        <svg aria-hidden="true" className="w-12 h-12 mx-auto text-bad mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-xl font-semibold text-ink mb-2">เกิดข้อผิดพลาด</h2>
        <p className="text-ink-2 mb-5 text-sm">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-accent text-accent-ink rounded-[6px] font-medium text-sm hover:opacity-90 transition-opacity whitespace-nowrap tap-feedback"
        >
          โหลดใหม่
        </button>
      </div>
    </div>
  );
}
