import React from 'react';

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center bg-[#C7CFDA] rounded-xl shadow-lg p-8 max-w-md border border-[#E55143]/30">
        <svg className="w-16 h-16 mx-auto text-[#E55143] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-xl font-bold text-[#014167] mb-2">เกิดข้อผิดพลาด</h2>
        <p className="text-[#014167] mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-[#699D5D] text-[#FDFCDF] rounded-lg font-bold hover:shadow-lg transition-all glow-hover"
        >
          โหลดใหม่
        </button>
      </div>
    </div>
  );
}
