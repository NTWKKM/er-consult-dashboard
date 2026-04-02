import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = "กำลังโหลดข้อมูล..." }: LoadingSpinnerProps) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-16 h-16 border-4 border-[#E55143] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xl text-[#FDFCDF] font-semibold">{message}</p>
      </div>
    </div>
  );
}
