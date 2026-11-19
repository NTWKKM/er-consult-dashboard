"use client";

import React from "react";

interface SkeletonLoadingProps {
  darkMode?: boolean;
  count?: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-[10px] p-3 border border-rule border-l-4 border-l-rule-2 bg-paper">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-[6px] skeleton"></div>
        <div className="flex-1">
          <div className="skeleton h-4 w-24 mb-1.5"></div>
          <div className="skeleton h-3 w-32"></div>
        </div>
        <div className="skeleton h-5 w-10 rounded-[4px]"></div>
      </div>
      <div className="p-2 rounded-[6px] mb-2 bg-paper-3 border border-rule">
        <div className="skeleton h-3 w-12 mb-1.5"></div>
        <div className="skeleton h-3 w-full mb-1"></div>
        <div className="skeleton h-3 w-3/4"></div>
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-8 flex-1 rounded-[6px]"></div>
        <div className="skeleton h-8 flex-1 rounded-[6px]"></div>
      </div>
    </div>
  );
}

function SkeletonDeptHeader() {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-[6px] border border-rule bg-paper-3">
      <div className="skeleton h-4 w-20"></div>
      <div className="skeleton h-5 w-8 rounded-[4px]"></div>
    </div>
  );
}

export default function SkeletonLoading({ count = 3 }: SkeletonLoadingProps) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5">
        {/* Header skeleton */}
        <div className="mb-4 flex justify-center">
          <div className="skeleton h-11 w-72 rounded-[10px]"></div>
        </div>

        {/* Content skeleton */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Surgery column */}
          <div className="lg:flex-[3] rounded-[10px] border border-rule bg-paper-2 overflow-hidden">
            <div className="bg-bad-soft border-b border-rule h-12"></div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <SkeletonDeptHeader />
                  <SkeletonCard />
                </div>
              ))}
            </div>
          </div>

          {/* Ortho column */}
          <div className="lg:flex-[1] rounded-[10px] border border-rule bg-paper-2 overflow-hidden">
            <div className="bg-ok-soft border-b border-rule h-12"></div>
            <div className="p-4">
              <div className="flex flex-col gap-2">
                <SkeletonDeptHeader />
                <SkeletonCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
