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
    return <div className="text-center p-10 text-slate-600 text-lg font-semibold">Loading...</div>;
  }

  // VVVV นี่คือส่วนหน้าตาที่แก้ไขใหม่ทั้งหมด (Theme สว่าง) VVVV
  return (
    // เปลี่ยนพื้นหลังเป็นสีเทาอ่อน (เข้ากับ Layout)
    <div className="p-4 sm:p-6 lg:p-8 bg-slate-100 min-h-screen">
      
      {/* Dashboard ศัลยกรรม */}
      <section className="mb-10">
        <h2 className="text-3xl font-bold text-slate-800 mb-6 border-b border-slate-300 pb-3">
          Surgery Dashboard
        </h2>
        
        {/* Grid Layout เหมือนเดิม แต่ปรับสีตัวอักษร */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {SURGERY_DEPTS.map(dept => {
            const cases = getCasesForDepartment(dept);
            return (
              <div key={dept} className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-slate-700">
                  {dept} 
                  <span className={`ml-2 font-bold ${cases.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    ({cases.length})
                  </span>
                </h3>
                {cases.length === 0 ? (
                  <p className="text-slate-500 italic px-2">ไม่มีเคสค้าง</p>
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
        <h2 className="text-3xl font-bold text-slate-800 mb-6 border-b border-slate-300 pb-3">
          Ortho Dashboard
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {ORTHO_DEPTS.map(dept => {
             const cases = getCasesForDepartment(dept);
            return (
              <div key={dept} className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-slate-700">
                  {dept} 
                  <span className={`ml-2 font-bold ${cases.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    ({cases.length})
                  </span>
                </h3>
                {cases.length === 0 ? (
                  <p className="text-slate-500 italic px-2">ไม่มีเคสค้าง</p>
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