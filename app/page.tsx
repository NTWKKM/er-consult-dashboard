"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import ConsultCard from "@/app/components/ConsultCard";

export default function Dashboard() {
  const [allCases, setAllCases] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);

  const SURGERY_DEPTS = ["Gen Sx", "Sx Trauma", "Neuro Sx", "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"];
  const ORTHO_DEPTS = ["Ortho"];

  useEffect(() => {
    const q = query(
      collection(db, "consults"), 
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const cases: any[] = []; 
      querySnapshot.forEach((doc) => {
        cases.push({ id: doc.id, ...doc.data() });
      });
      setAllCases(cases);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); 

  const getCasesForDepartment = (deptName: string) => {
    return allCases.filter(caseData => 
      caseData.departments[deptName]
      && caseData.departments[deptName].status === 'pending'
    );
  };

  if (loading) {
    return <div className="text-center p-10 text-white">Loading...</div>;
  }

  // VVVV นี่คือส่วนหน้าตาที่แก้ไขใหม่ทั้งหมด VVVV
  return (
    // เปลี่ยนพื้นหลังเป็นสีเทาเข้ม
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-900 min-h-screen">
      
      {/* Dashboard ศัลยกรรม */}
      <section className="mb-10">
        <h2 className="text-3xl font-bold text-blue-300 mb-6 border-b border-gray-700 pb-2">
          Surgery Dashboard
        </h2>
        
        {/* จัดการ์ดเป็น Grid (นี่คือส่วนที่แก้ปัญหา "เรียงยาว") */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {SURGERY_DEPTS.map(dept => {
            const cases = getCasesForDepartment(dept);
            return (
              // คอลัมน์ของแต่ละแผนกย่อย
              <div key={dept} className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-white">
                  -- {dept} -- 
                  <span className={cases.length > 0 ? 'text-yellow-400' : 'text-green-400'}>
                    ({cases.length} เคส)
                  </span>
                </h3>
                {cases.length === 0 ? (
                  <p className="text-gray-400 italic">ไม่มีเคสค้าง</p>
                ) : (
                  cases.map(caseData => (
                    <ConsultCard 
                      key={caseData.id} 
                      caseData={caseData} 
                      caseId={caseData.id}
                      departmentName={dept} 
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Dashboard ออโธ */}
      <section>
        <h2 className="text-3xl font-bold text-green-300 mb-6 border-b border-gray-700 pb-2">
          Ortho Dashboard
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {ORTHO_DEPTS.map(dept => {
             const cases = getCasesForDepartment(dept);
            return (
              <div key={dept} className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-white">
                  -- {dept} -- 
                  <span className={cases.length > 0 ? 'text-yellow-400' : 'text-green-400'}>
                    ({cases.length} เคส)
                  </span>
                </h3>
                {cases.length === 0 ? (
                  <p className="text-gray-400 italic">ไม่มีเคสค้าง</p>
                ) : (
                  cases.map(caseData => (
                    <ConsultCard 
                      key={caseData.id} 
                      caseData={caseData} 
                      caseId={caseData.id}
                      departmentName={dept} 
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
  // ^^^^ สิ้นสุดส่วนหน้าตาที่แก้ไข ^^^^
}