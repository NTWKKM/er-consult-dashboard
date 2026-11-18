import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = "กำลังโหลดข้อมูล…" }: LoadingSpinnerProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-base text-ink-2 font-medium">{message}</p>
      </div>
    </div>
  );
}
