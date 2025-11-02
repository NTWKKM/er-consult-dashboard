"use client"; // ต้องเป็น Client Component เพราะมีการใช้ state และ event

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function SubmitPage() {
  const [hn, setHn] = useState("");
  const [problem, setProblem] = useState("");
  
  // VVVV แก้ไขแล้ว: เพิ่ม <string[]> VVVV
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  // รายชื่อแผนกทั้งหมดจาก Google Form ของคุณ
  const allDepartments = [
    "Gen Sx", "Sx Trauma", "Ortho", "Neuro Sx", 
    "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"
  ];

  // VVVV แก้ไขแล้ว: เพิ่ม (dept: string) VVVV
  const handleCheckboxChange = (dept: string) => { 
    setSelectedDepts(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept) 
        : [...prev, dept]
    );
  };

  // VVVV แก้ไขแล้ว: เพิ่ม (e: React.FormEvent) VVVV
  const handleSubmit = async (e: React.FormEvent) => { 
    e.preventDefault();
    if (!hn || !problem || selectedDepts.length === 0) {
      alert("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    // VVVV แก้ไขแล้ว: เพิ่ม Type { [key: string]: any } VVVV
    const departmentsMap: { [key: string]: any } = {}; 
    selectedDepts.forEach(dept => {
      departmentsMap[dept] = { status: "pending", completedAt: null };
    });

    try {
      // เพิ่มข้อมูลเข้า Collection 'consults'
      await addDoc(collection(db, "consults"), {
        hn: hn,
        problem: problem,
        // resusTeam: ... (เพิ่มฟิลด์อื่น ๆ ตามต้องการ)
        createdAt: serverTimestamp(), // ใช้เวลาของ Server
        status: "pending",
        departments: departmentsMap
      });
      
      alert("ส่งเคสปรึกษาสำเร็จ!");
      // เคลียร์ฟอร์ม
      setHn("");
      setProblem("");
      setSelectedDepts([]);

    } catch (error) { // VVVV นี่คือส่วนที่แก้ไข Error ล่าสุด VVVV
      console.error("Error adding document: ", error);
      // เราต้องเช็ค Type ก่อนใช้ .message
      if (error instanceof Error) {
        alert("เกิดข้อผิดพลาด: " + error.message);
      } else {
        alert("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
      }
      // ^^^^ สิ้นสุดส่วนที่แก้ไข ^^^^
    }
  };

  return (
    <div>
      <h1>ส่งเคสปรึกษา (ER MNRH)</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>HN:</label>
          <input type="text" value={hn} onChange={(e) => setHn(e.target.value)} />
        </div>
        <div>
          <label>Problem:</label>
          <textarea value={problem} onChange={(e) => setProblem(e.target.value)} />
        </div>
        <div>
          <label>ปรึกษาแผนก (เลือกได้หลายแผนก):</label>
          {allDepartments.map(dept => (
            <div key={dept}>
              <input 
                type="checkbox" 
                id={dept} 
                value={dept}
                checked={selectedDepts.includes(dept)}
                onChange={() => handleCheckboxChange(dept)}
              />
              <label htmlFor={dept}>{dept}</label>
            </div>
          ))}
        </div>
        <button type="submit">ส่งปรึกษา</button>
      </form>
    </div>
  );
}