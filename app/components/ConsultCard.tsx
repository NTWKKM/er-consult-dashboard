"use client";

import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function ConsultCard({ caseData, caseId, departmentName }: { caseData: any, caseId: any, departmentName: any }) {
  
  const { hn, problem, createdAt, departments } = caseData;
  const deptStatus = departments[departmentName];
  const isCompleted = deptStatus.status === "completed";

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "N/A";
    return timestamp.toDate().toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const timeAgo = formatTime(createdAt);
  const completedTime = formatTime(deptStatus.completedAt);

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
    // VVVV นี่คือดีไซน์ใหม่: "การ์ดสีขาว + Badge สถานะ" VVVV
    <div className="bg-white rounded-lg p-4 shadow-lg w-full max-w-md mx-auto border border-gray-200">
      
      {/* ส่วนหัว: HN และ Badge สถานะ */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
        <h3 className="text-2xl font-bold text-gray-800">HN: {hn}</h3>
        
        {/* นี่คือ "Badge" (ป้ายสถานะ) ที่สีชัดเจนขึ้น */}
        <span 
          className={`px-3 py-1 text-xs font-bold text-white rounded-full
          ${isCompleted ? 'bg-green-500' : 'bg-orange-500'}
          `}
        >
          {isCompleted ? 'Completed' : 'Pending'}
        </span>
      </div>

      {/* ส่วนเนื้อหา */}
      <div className="mb-3">
        <p className="text-gray-700">{problem}</p>
        <p className="text-sm text-blue-600 font-semibold mt-1">({departmentName})</p>
      </div>

      {/* ส่วนเวลา */}
      <div className="text-sm text-gray-500 mb-4">
        <p>เวลาส่ง: <span className="font-semibold text-gray-700">{timeAgo}</span></p>
        {isCompleted && (
          <p className="text-green-600 font-semibold">เวลาปิดงาน: {completedTime}</p>
        )}
      </div>

      {/* ปุ่มกด (ถ้ายังไม่เสร็จ) */}
      {!isCompleted && (
        // VVVV เปลี่ยนปุ่มเป็น "สีแดง" เหมือนในตัวอย่าง VVVV
        <button 
          onClick={handleCloseCase}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow"
        >
          ปิดงาน (Close Case)
        </button>
      )}

      {/* สถานะแผนกอื่น (ย่อให้เล็กน้อย) */}
      <details className="mt-3 text-xs text-gray-500 cursor-pointer">
        <summary>ดูสถานะแผนกอื่น</summary>
        <ul className="pl-4 mt-1 space-y-1">
          {Object.entries(departments).map(([dept, status]: [string, any]) => (
            <li key={dept} className="flex justify-between">
              <span>{dept}:</span>
              <span className={`font-semibold ${status.status === 'completed' ? 'text-green-600' : 'text-orange-500'}`}>
                {status.status}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}