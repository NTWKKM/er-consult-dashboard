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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xl text-gray-700 font-semibold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  const totalPendingCases = allCases.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-8 text-center slide-in">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
              ER Consult Dashboard
            </h1>
          </div>
          <p className="text-gray-600 text-lg font-medium">Maharaj Hospital - Emergency Department</p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white px-6 py-3 rounded-full shadow-md border border-gray-200">
            <span className="text-gray-700 font-semibold">เคสรอดำเนินการ:</span>
            <span className={`text-2xl font-bold ${totalPendingCases > 0 ? 'text-red-600 pulse-urgent' : 'text-green-600'}`}>
              {totalPendingCases}
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-8 flex-wrap">
          <button
            className={`px-8 py-3 rounded-xl font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg
              ${view === 'surgery' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' 
                : 'bg-white text-blue-700 border-2 border-blue-300 hover:border-blue-500'}
            `}
            onClick={() => setView('surgery')}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Surgery
            </span>
          </button>
          <button
            className={`px-8 py-3 rounded-xl font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg
              ${view === 'ortho' 
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white' 
                : 'bg-white text-emerald-700 border-2 border-emerald-300 hover:border-emerald-500'}
            `}
            onClick={() => setView('ortho')}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Orthopedics
            </span>
          </button>
          <button
            className={`px-8 py-3 rounded-xl font-bold shadow-md transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg
              ${view === 'both' 
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' 
                : 'bg-white text-indigo-700 border-2 border-indigo-300 hover:border-indigo-500'}
            `}
            onClick={() => setView('both')}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              ทั้งสองแผนก
            </span>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {(view === 'surgery' || view === 'both') && (
            <div className="flex-1 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl slide-in">
              <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white px-6 py-4">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Surgery Departments
                  </h2>
                  <p className="text-blue-100 text-sm mt-1">แผนกศัลยกรรม</p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
                {SURGERY_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div key={dept} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 rounded-lg border border-blue-100">
                        <h3 className="text-lg font-bold text-gray-800">{dept}</h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${cases.length > 0 ? 'bg-red-100 text-red-700 pulse-urgent' : 'bg-green-100 text-green-700'}`}>
                          {cases.length} เคส
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-6 px-4 bg-gray-50 rounded-lg border border-gray-100">
                          <svg className="w-12 h-12 mx-auto text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-gray-500 font-medium">ไม่มีเคสค้าง</p>
                        </div>
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
            <div className="flex-1 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl slide-in">
              <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-6 py-4">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Orthopedic Department
                  </h2>
                  <p className="text-emerald-100 text-sm mt-1">แผนกศัลยกรรมกระดูก</p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
                {ORTHO_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div key={dept} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 rounded-lg border border-emerald-100">
                        <h3 className="text-lg font-bold text-gray-800">{dept}</h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${cases.length > 0 ? 'bg-red-100 text-red-700 pulse-urgent' : 'bg-green-100 text-green-700'}`}>
                          {cases.length} เคส
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-6 px-4 bg-gray-50 rounded-lg border border-gray-100">
                          <svg className="w-12 h-12 mx-auto text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-gray-500 font-medium">ไม่มีเคสค้าง</p>
                        </div>
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
    </div>
  );
}