"use client";

import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

// คอมโพเนนต์นี้รับ props: 
// - caseData (ข้อมูลเคสทั้งหมด)
// - caseId (ID ของ Document)
// - departmentName (ชื่อแผนกที่ Dashboard นี้กำลังแสดงผล เช่น "Gen Sx")
export default function ConsultCard({ caseData, caseId, departmentName }) {

  const { hn, problem, createdAt, departments } = caseData;

  // ข้อมูลสถานะของแผนกนี้โดยเฉพาะ
  const deptStatus = departments[departmentName];

  // ฟังก์ชันสำหรับ "ปิดงาน"
  const handleCloseCase = async () => {
    if (!confirm(`ยืนยันการปิดเคสของแผนก ${departmentName}?`)) return;

    const caseRef = doc(db, "consults", caseId);

    try {
      // นี่คือการอัปเดตเฉพาะฟิลด์ของแผนกนี้ โดยใช้ "dot notation"
      // เช่น 'departments.Gen Sx.status'
      const updateKeyStatus = `departments.${departmentName}.status`;
      const updateKeyTime = `departments.${departmentName}.completedAt`;

      await updateDoc(caseRef, {
        [updateKeyStatus]: "completed",
        [updateKeyTime]: serverTimestamp()
        // (คุณสามารถเพิ่ม Logic ตรวจสอบว่าทุกแผนก completed แล้วหรือยัง
        // แล้วค่อยอัปเดต status หลักของเคส)
      });

    } catch (error) {
      console.error("Error closing case: ", error);
      alert("เกิดข้อผิดพลาดในการปิดเคส");
    }
  };

  // ตรวจสอบสถานะเพื่อแสดงผล
  const isCompleted = deptStatus.status === "completed";
  const timeAgo = createdAt?.toDate().toLocaleTimeString('th-TH'); // แปลง Timestamp เป็นเวลา
  const completedTime = deptStatus.completedAt?.toDate().toLocaleString('th-TH');

  return (
    <div style={{ border: '1px solid black', margin: '10px', padding: '10px', backgroundColor: isCompleted ? '#e0ffe0' : '#ffffdd' }}>
      <h3>HN: {hn} (ปรึกษา {departmentName})</h3>
      <p>Problem: {problem}</p>
      <p>เวลาส่งปรึกษา: {timeAgo}</p>

      {isCompleted ? (
        <p style={{ color: 'green' }}>ปิดงานแล้วเมื่อ: {completedTime}</p>
      ) : (
        <button onClick={handleCloseCase}>ปิดงาน (Close Case)</button>
      )}

      {/* ส่วนแสดงสถานะแผนกอื่น (โบนัส) */}
      <div>
        <strong>สถานะแผนกอื่นในเคสนี้:</strong>
        <ul>
          {Object.entries(departments).map(([dept, status]) => (
            <li key={dept}>
              {dept}: {status.status} 
              {status.completedAt && ` (เสร็จ: ${status.completedAt.toDate().toLocaleTimeString('th-TH')})`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}