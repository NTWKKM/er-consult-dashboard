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
    return <div className="text-center p-10 text-gray-600 text-lg font-semibold">Loading...</div>;
  }

  // VVVV นี่คือส่วนหน้าตาที่แก้ไขใหม่ทั้งหมด (Theme "Refer Program") VVVV
  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
      
      {/* --- Dashboard ศัลยกรรม --- */}
      {/* เราจะสร้างการ์ดใหญ่ที่มี Header ไล่สี */}
      <div className="bg-white rounded-xl shadow-2xl mb-10">
        {/* นี่คือ Header ไล่สี */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-t-xl">
          <h2 className="text-2xl font-bold">Surgery Dashboard</h2>
        </div>
        
        {/* เนื้อหา (Grid ของการ์ด) */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {SURGERY_DEPTS.map(dept => {
            const cases = getCasesForDepartment(dept);
            return (
              <div key={dept} className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-gray-700">
                  {dept} 
                  <span className={`ml-2 font-bold ${cases.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ({cases.length})
                  </span>
                </h3>
                {cases.length === 0 ? (
                  <p className="text-gray-400 italic px-2">ไม่มีเคสค้าง</p>
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
      </div>

      {/* --- Dashboard ออโธ --- */}
      <div className="bg-white rounded-xl shadow-2xl">
        <div className="bg-gradient-to-r from-green-600 to-teal-700 text-white p-5 rounded-t-xl">
          <h2 className="text-2xl font-bold">Ortho Dashboard</h2>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {ORTHO_DEPTS.map(dept => {
             const cases = getCasesForDepartment(dept);
            return (
              <div key={dept} className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold text-gray-700">
                  {dept} 
                  <span className={`ml-2 font-bold ${cases.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ({cases.length})
                  </span>
                </h3>
                {cases.length === 0 ? (
                  <p className="text-gray-400 italic px-2">ไม่มีเคสค้าง</p>
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
      </div>
    </div>
  );
  // ^^^^ สิ้นสุดส่วนหน้าตาที่แก้ไข ^^^^
}