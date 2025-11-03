import React from "react";

interface ConsultCardProps {
  caseData: any;
  caseId: string;
  departmentName: string;
}

export default function ConsultCard({ caseData, caseId, departmentName }: ConsultCardProps) {
  const hn = caseData.hn || "-";
  const problem = caseData.problem || "-";
  const isCompleted = caseData.departments[departmentName]?.status === "completed";
  const completedTime = caseData.departments[departmentName]?.completedAt
    ? new Date(caseData.departments[departmentName].completedAt.seconds * 1000).toLocaleString("th-TH")
    : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt.seconds * 1000).toLocaleString("th-TH")
    : "-";

  return (
    <div className="card-shadow hover:card-shadow-hover transition-all duration-200 bg-white border-l-4 border-blue-500 rounded-lg p-5 hover:-translate-y-1">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">HN: {hn}</h3>
            <p className="text-xs text-gray-500 font-medium">{departmentName}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}
        >
          {isCompleted ? '✓ เสร็จสิ้น' : '⏱ รอดำเนินการ'}
        </span>
      </div>
      
      <div className="mb-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
        <p className="text-sm text-gray-500 font-semibold mb-1">รายละเอียดปัญหา:</p>
        <p className="text-gray-800 leading-relaxed">{problem}</p>
      </div>
      
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{timeAgo}</span>
        </div>
        {isCompleted && (
          <div className="flex items-center gap-2 text-emerald-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold text-xs">ปิดงาน: {completedTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}