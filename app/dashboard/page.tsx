"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import ConsultCard from "@/app/components/ConsultCard";

export default function Dashboard() {
  // VVVV แก้ไขบรรทัดนี้ VVVV (เพิ่ม <any[]>)
  const [allCases, setAllCases] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);

  // แผนกที่เราจะแสดงผล (คุณสามารถทำเป็น Dropdown ให้เลือกได้)
  const SURGERY_DEPTS = ["Gen Sx", "Sx Trauma", "Neuro Sx", "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"];
  const ORTHO_DEPTS = ["Ortho"];

  useEffect(() => {
    // สร้าง Query ดึงเฉพาะเคสที่ status = "pending" (เคสที่ยังไม่เสร็จสมบูรณ์)
    // และเรียงตามเวลาที่สร้าง (ใหม่สุดขึ้นก่อน)
    const q = query(
      collection(db, "consults"), 
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    // onSnapshot คือหัวใจของ Real-time
    // มันจะทำงานครั้งแรกเพื่อดึงข้อมูลทั้งหมด 
    // และจะทำงานอีก "ทุกครั้ง" ที่ข้อมูลใน Firestore ที่ตรง Query นี้มีการเปลี่ยนแปลง
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      
      // VVVV แก้ไขบรรทัดนี้ VVVV (เพิ่ม : any[])
      const cases: any[] = []; 
      
      querySnapshot.forEach((doc) => {
        cases.push({ id: doc.id, ...doc.data() });
      });
      setAllCases(cases);
      setLoading(false);
    });

    // Cleanup function เมื่อ Component ถูก unmount
    return () => unsubscribe();
  }, []); // ทำงานแค่ครั้งเดียวตอนโหลดหน้า

  // ฟังก์ชันสำหรับกรองเคสตามแผนก
  const getCasesForDepartment = (deptName: string) => { // (เพิ่ม :string ตรงนี้)
    return allCases.filter(caseData => 
      caseData.departments[deptName] // ต้องมีชื่อแผนกนี้ใน Object
      && caseData.departments[deptName].status === 'pending' // และแผนกนี้ยังไม่ปิดงาน
    );
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>ER MNRH Monitor Room (Real-time)</h1>
      
      {/* Dashboard ศัลยกรรม */}
      <section>
        <h2>Surgery Dashboard</h2>
        {SURGERY_DEPTS.map(dept => (
          <div key={dept} style={{ marginBottom: '20px' }}>
            <h3>-- {dept} -- ({getCasesForDepartment(dept).length} เคส)</h3>
            {getCasesForDepartment(dept).length === 0 ? (
              <p>ไม่มีเคสค้าง</p>
            ) : (
              getCasesForDepartment(dept).map(caseData => (
                <ConsultCard 
                  key={caseData.id} 
                  caseData={caseData} 
                  caseId={caseData.id}
                  departmentName={dept} // บอก Card ว่านี่คือ Dashboard ของแผนกอะไร
                />
              ))
            )}
          </div>
        ))}
      </section>

      {/* Dashboard ออโธ */}
      <section>
        <h2>Ortho Dashboard</h2>
        {ORTHO_DEPTS.map(dept => (
          <div key={dept} style={{ marginBottom: '20px' }}>
            <h3>-- {dept} -- ({getCasesForDepartment(dept).length} เคส)</h3>
            {getCasesForDepartment(dept).length === 0 ? (
              <p>ไม่มีเคสค้าง</p>
            ) : (
              getCasesForDepartment(dept).map(caseData => (
                <ConsultCard 
                  key={caseData.id} 
                  caseData={caseData} 
                  caseId={caseData.id}
                  departmentName={dept} 
                />
              ))
            )}
          </div>
        ))}
      </section>
    </div>
  );
}