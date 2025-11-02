"use client";

import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function ConsultCard({ caseData, caseId, departmentName }: { caseData: any, caseId: any, departmentName: any }) {
  
  const { hn, problem, createdAt, departments } = caseData;
  const deptStatus = departments[departmentName];
  const isCompleted = deptStatus.status === "completed";

  // --- ฟังก์ชันแปลงเวลาให้อ่านง่าย ---
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
    // VVVV นี่คือส่วนที่ใช้ Tailwind CSS VVVV

    // เราใช้เงื่อนไขเพื่อเปลี่ยนสีพื้นหลัง:
    // ถ้าเสร็จแล้ว (isCompleted) ให้เป็น 'bg-green-100 border-green-300'
    // ถ้ายัง (pending) ให้เป็น 'bg-yellow-100 border-yellow-300'
    <div 
      className={`
        border rounded-lg p-4 shadow-md w-full max-w-md mx-auto
        ${isCompleted ? 'bg-green-100 border-green-300' : 'bg-yellow-100 border-yellow-300'}
      `}
    >
      {/* ส่วนหัวของการ์ด */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold text-gray-800">HN: {hn}</h3>
        <span className="text-sm font-semibold text-gray-600">
          ปรึกษา {departmentName}
        </span>
      </div>

      {/* ส่วนเนื้อหา */}
      <div className="mb-4">
        <p className="text-gray-700 font-semibold">Problem:</p>
        <p className="text-gray-600 ml-2">{problem}</p>
      </div>

      {/* ส่วนเวลา */}
      <div className="text-sm text-gray-500 mb-4">
        <p>เวลาส่งปรึกษา: {timeAgo}</p>
        {isCompleted && (
          <p className="text-green-600 font-semibold">ปิดงานแล้วเมื่อ: {completedTime}</p>
        )}
      </div>

      {/* ปุ่มกด (ถ้ายังไม่เสร็จ) */}
      {!isCompleted && (
        <button 
          onClick={handleCloseCase}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          ปิดงาน (Close Case)
        </button>
      )}

      {/* ส่วนแสดงสถานะแผนกอื่น */}
      <div className="mt-4 border-t pt-2">
        <strong className="text-xs text-gray-500">สถานะแผนกอื่นในเคสนี้:</strong>
        <ul className="text-xs text-gray-600">
          {Object.entries(departments).map(([dept, status]: [string, any]) => (
            <li key={dept} className="flex justify-between">
              <span>{dept}:</span>
              <span className={status.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}>
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