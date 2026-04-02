"use client";

import React from "react";

interface SkeletonLoadingProps {
  darkMode?: boolean;
  count?: number;
}

function SkeletonCard({ darkMode }: { darkMode: boolean }) {
  return (
    <div
      className={`rounded-lg p-3 border-l-4 ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#699D5D]/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg skeleton`}></div>
        <div className="flex-1">
          <div className="skeleton h-4 w-24 mb-1.5"></div>
          <div className="skeleton h-3 w-32"></div>
        </div>
        <div className="skeleton h-5 w-8 rounded-full"></div>
      </div>
      <div className={`p-2 rounded-lg mb-2 ${darkMode ? "bg-gray-700" : "bg-[#014167]/20"}`}>
        <div className="skeleton h-3 w-12 mb-1.5"></div>
        <div className="skeleton h-3 w-full mb-1"></div>
        <div className="skeleton h-3 w-3/4"></div>
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-7 flex-1 rounded-lg"></div>
        <div className="skeleton h-7 flex-1 rounded-lg"></div>
      </div>
    </div>
  );
}

function SkeletonDeptHeader({ darkMode }: { darkMode: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
        darkMode ? "bg-gray-950 border-gray-800" : "bg-[#012a47] border-[#E55143]/20"
      }`}
    >
      <div className="skeleton h-4 w-20"></div>
      <div className="skeleton h-5 w-8 rounded-full"></div>
    </div>
  );
}

export default function SkeletonLoading({ darkMode = false, count = 3 }: SkeletonLoadingProps) {
  return (
    <div className="min-h-screen">
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5">
        {/* Header skeleton */}
        <div className="mb-4 flex justify-center">
          <div className="skeleton h-10 w-64 rounded-full"></div>
        </div>

        {/* Content skeleton */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Surgery column */}
          <div className={`lg:flex-[3] rounded-xl shadow-lg overflow-hidden ${darkMode ? "bg-gray-900" : "bg-[#b0bac7]"}`}>
            <div className="bg-[#E55143]/60 h-12"></div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <SkeletonDeptHeader darkMode={darkMode} />
                  <SkeletonCard darkMode={darkMode} />
                </div>
              ))}
            </div>
          </div>

          {/* Ortho column */}
          <div className={`lg:flex-[1] rounded-xl shadow-lg overflow-hidden ${darkMode ? "bg-gray-900" : "bg-[#b0bac7]"}`}>
            <div className="bg-[#699D5D]/60 h-12"></div>
            <div className="p-4">
              <div className="flex flex-col gap-2">
                <SkeletonDeptHeader darkMode={darkMode} />
                <SkeletonCard darkMode={darkMode} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
