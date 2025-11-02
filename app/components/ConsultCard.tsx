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
    <div className="rounded-xl shadow-lg bg-gradient-to-tr from-cyan-50 via-white to-purple-50 border border-gray-200 p-5">
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
        <h3 className="text-2xl font-bold text-gray-800">HN: {hn}</h3>
        <span
          className={`px-3 py-1 text-xs font-bold text-white rounded-full
          ${isCompleted ? 'bg-green-500' : 'bg-orange-500'}
          `}
        >
          {isCompleted ? 'Completed' : 'Pending'}
        </span>
      </div>
      <div className="mb-3">
        <p className="text-gray-700">{problem}</p>
        <p className="text-sm text-blue-600 font-semibold mt-1">({departmentName})</p>
      </div>
      <div className="text-sm text-gray-500 mb-4">
        <p>เวลาส่ง: <span className="font-semibold text-gray-700">{timeAgo}</span></p>
        {isCompleted && (
          <p className="text-green-600 font-semibold">เวลาปิดงาน: {completedTime}</p>
        )}
      </div>
      {/* ปุ่มปิดเคส/อื่นๆ สามารถเติมได้ตามฟีเจอร์ของโปรเจกต์ */}
    </div>
  );
}