"use client";

import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function ConsultCard({ caseData, caseId, departmentName }: { caseData: any, caseId: any, departmentName: any }) {
  
  const { hn, problem, createdAt, departments } = caseData;
  const deptStatus = departments[departmentName];
  const isCompleted = deptStatus.status === "completed";

  // --- ฟังก์ชันแปลงเวลา ---
  const formatTime = (timestamp: any) => {
    if (!timestamp) return "N/A";
    return timestamp.toDate().toLocaleString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    });
  };

  const timeAgo = formatTime(createdAt);
  const completedTime = formatTime(deptStatus.completedAt);

  // --- ฟังก์ชันปิดงาน (เหมือนเดิม) ---
  const handleCloseCase = async () => {
    if (!confirm(`ยืนยันการปิดเคสของแผนก ${departmentName}?`)) return;
    const caseRef = doc(db, "consults", caseId);
    try {
      const updateKeyStatus = `departments.${departmentName}.status`;
      const updateKeyTime = `departments.${departmentName}.completedAt`;
      await updateDoc(caseRef, {
        [updateKeyStatus]: "completed",
        [updateKeyTime]: serverTimestamp()
      });
    } catch (error) {
      console.error("Error closing case: ", error);
      alert("เกิดข้อผิดพลาดในการปิดเคส");
    }
  };

  return (
    // VVVV นี่คือดีไซน์ใหม่: "การ์ดสีขาว + แถบสถานะด้านซ้าย" VVVV
    <div 
      className={`
        bg-white rounded-lg p-4 shadow-lg w-full max-w-md mx-auto
        border-l-4 ${isCompleted ? 'border-green-500' : 'border-orange-400'}
      `}
    >
      {/* ส่วนหัวของการ์ด */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-2xl font-bold text-slate-800">HN: {hn}</h3>
        <span className="text-sm font-semibold text-blue-700 px-3 py-1 bg-blue-100 rounded-full">
          {departmentName}
        </span>
      </div>

      {/* ส่วนเนื้อหา */}
      <div className="mb-4">
        <p className="text-slate-600 ml-1">{problem}</p>
      </div>

      {/* ส่วนเวลา */}
      <div className="text-sm text-slate-500 mb-4 border-t border-slate-200 pt-3">
        <p>เวลาส่งปรึกษา: <span className="font-semibold">{timeAgo}</span></p>
        {isCompleted && (
          <p className="text-green-600 font-semibold">ปิดงานแล้วเมื่อ: {completedTime}</p>
        )}
      </div>

      {/* ปุ่มกด (ถ้ายังไม่เสร็จ) */}
      {!isCompleted && (
        <button 
          onClick={handleCloseCase}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow"
        >
          ปิดงาน (Close Case)
        </button>
      )}

      {/* ส่วนแสดงสถานะแผนกอื่น */}
      <div className="mt-4 border-t border-slate-200 pt-2">
        <strong className="text-xs text-slate-500">สถานะเคสนี้:</strong>
        <ul className="text-xs text-slate-600">
          {Object.entries(departments).map(([dept, status]: [string, any]) => (
            <li key={dept} className="flex justify-between">
              <span>{dept}:</span>
              <span className={`font-semibold ${status.status === 'completed' ? 'text-green-600' : 'text-orange-600'}`}>
                {status.status}
                {status.status === 'completed' && ` (${formatTime(status.completedAt)})`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}