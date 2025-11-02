"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import ConsultCard from "@/app/components/ConsultCard";

export default function Dashboard() {
  const [allCases, setAllCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'both' | 'surgery' | 'ortho'>('both');

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gradient-to-tr from-blue-50 via-purple-50 to-green-50 min-h-screen">
      <h1 className="text-3xl font-extrabold text-blue-700 mb-8 text-center drop-shadow">ER Consult Dashboard</h1>
      <div className="flex justify-center gap-4 mb-8">
        <button
          className={`px-6 py-2 rounded-full font-bold shadow transition
            ${view === 'surgery' ? 'bg-blue-500 text-white' : 'bg-white text-blue-700 border border-blue-500'}
          `}
          onClick={() => setView('surgery')}
        >Surgery</button>
        <button
          className={`px-6 py-2 rounded-full font-bold shadow transition
            ${view === 'ortho' ? 'bg-green-500 text-white' : 'bg-white text-green-700 border border-green-500'}
          `}
          onClick={() => setView('ortho')}
        >Ortho</button>
        <button
          className={`px-6 py-2 rounded-full font-bold shadow transition
            ${view === 'both' ? 'bg-purple-500 text-white' : 'bg-white text-purple-700 border border-purple-500'}
          `}
          onClick={() => setView('both')}
        >ดูทั้งสองแผนก</button>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
        {(view === 'surgery' || view === 'both') && (
          <div className="flex-1 bg-white rounded-xl shadow-2xl mb-10">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-t-xl">
              <h2 className="text-2xl font-bold">Surgery Dashboard</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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
        )}
        {(view === 'ortho' || view === 'both') && (
          <div className="flex-1 bg-white rounded-xl shadow-2xl mb-10">
            <div className="bg-gradient-to-r from-green-600 to-teal-700 text-white p-5 rounded-t-xl">
              <h2 className="text-2xl font-bold">Ortho Dashboard</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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
        )}
      </div>
    </div>
  );
}