"use client"; // ต้องเป็น Client Component เพราะมีการใช้ state และ event

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function SubmitPage() {
  const [hn, setHn] = useState("");
  const [problem, setProblem] = useState("");

  // VVVV แก้ไขบรรทัดนี้ VVVV (เพิ่ม <string[]>)
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  // รายชื่อแผนกทั้งหมดจาก Google Form ของคุณ
  const allDepartments = [
    "Gen Sx", "Sx Trauma", "Ortho", "Neuro Sx", 
    "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"
  ];

  const handleCheckboxChange = (dept: string) => { // (เพิ่ม : string ตรงนี้)
    setSelectedDepts(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept) 
        : [...prev, dept]
    );
  };
  
  // (โค้ดที่เหลือเหมือนเดิม)
  // ... (ส่วน handleSubmit และ return ...)
  // ...
  const handleSubmit = async (e: React.FormEvent) => { // (เพิ่ม Type ตรงนี้)
    e.preventDefault();
    if (!hn || !problem || selectedDepts.length === 0) {
      alert("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    // สร้าง Object 'departments' ตาม Schema ที่เราออกแบบไว้
    const departmentsMap: { [key: string]: any } = {}; // (เพิ่ม Type ตรงนี้)
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

    } catch (error) {
      console.error("Error adding document: ", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
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