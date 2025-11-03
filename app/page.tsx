"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import ConsultCard from "@/app/components/ConsultCard";

export default function Dashboard() {
  const [allCases, setAllCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'both' | 'surgery' | 'ortho'>('both');

  const SURGERY_DEPTS = ["Gen Sx", "Sx Trauma", "Neuro Sx", "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"];
  const ORTHO_DEPTS = ["Ortho"];

  useEffect(() => {
    const q = query(
      collection(db, "consults"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const cases: any[] = [];
        querySnapshot.forEach((doc) => {
          cases.push({ id: doc.id, ...doc.data() });
        });
        setAllCases(cases);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Firestore error:", err);
        setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบการตั้งค่า Firebase");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const departmentCasesMap = useMemo(() => {
    const map: { [key: string]: any[] } = {};
    const allDepts = [...SURGERY_DEPTS, ...ORTHO_DEPTS];
    
    allDepts.forEach(dept => {
      map[dept] = allCases.filter(caseData =>
        caseData.departments[dept]
        && caseData.departments[dept].status === 'pending'
      );
    });
    
    return map;
  }, [allCases]);

  const getCasesForDepartment = (deptName: string) => {
    return departmentCasesMap[deptName] || [];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xl text-gray-600 font-semibold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-xl shadow-md p-8 max-w-md">
          <svg className="w-16 h-16 mx-auto text-rose-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gradient-to-r from-blue-400 to-blue-500 text-white rounded-lg font-semibold hover:from-blue-500 hover:to-blue-600 transition-all shadow-sm"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }

  const totalPendingCases = allCases.length;

  return (
    <div className="min-h-screen">
      <div className="max-w-[1600px] mx-auto p-2 sm:p-3 lg:p-4">
        <div className="mb-3 text-center slide-in">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-rose-400 to-rose-500 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-500 bg-clip-text text-transparent">
              ER Consult Dashboard
            </h1>
          </div>
          <p className="text-gray-500 text-sm font-medium">MNRH</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-white px-4 py-1.5 rounded-full shadow-sm border border-gray-100">
            <span className="text-gray-600 font-semibold text-sm">เคสรอดำเนินการ:</span>
            <span className={`text-xl font-bold ${totalPendingCases > 0 ? 'text-rose-500 pulse-urgent' : 'text-emerald-500'}`}>
              {totalPendingCases}
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-2 mb-4 flex-wrap">
          <button
            className={`px-4 py-1.5 rounded-lg font-bold shadow-sm transition-all duration-200 text-sm
              ${view === 'surgery' 
                ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white' 
                : 'bg-white text-blue-600 border border-blue-200 hover:border-blue-400 hover:bg-blue-50'}
            `}
            onClick={() => setView('surgery')}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Surgery
            </span>
          </button>
          <button
            className={`px-4 py-1.5 rounded-lg font-bold shadow-sm transition-all duration-200 text-sm
              ${view === 'ortho' 
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-white' 
                : 'bg-white text-emerald-600 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50'}
            `}
            onClick={() => setView('ortho')}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
              </svg>
              Ortho
            </span>
          </button>
          <button
            className={`px-4 py-1.5 rounded-lg font-bold shadow-sm transition-all duration-200 text-sm
              ${view === 'both' 
                ? 'bg-gradient-to-r from-purple-400 to-purple-500 text-white' 
                : 'bg-white text-purple-600 border border-purple-200 hover:border-purple-400 hover:bg-purple-50'}
            `}
            onClick={() => setView('both')}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              ทั้งสองแผนก
            </span>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          {(view === 'surgery' || view === 'both') && (
            <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-lg slide-in">
              <div className="bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-500 text-white px-4 py-2">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  Surgery
                  <span className="text-white/80 text-xs font-normal ml-1">แผนกศัลยกรรม</span>
                </h2>
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {SURGERY_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div key={dept} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-cyan-50/50 px-3 py-2 rounded-lg border border-blue-100/50">
                        <h3 className="text-sm font-bold text-gray-700">{dept}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cases.length > 0 ? 'bg-rose-100 text-rose-600 pulse-urgent' : 'bg-emerald-100 text-emerald-600'}`}>
                          {cases.length}
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-3 px-3 bg-gray-50/50 rounded-lg border border-gray-100/50">
                          <svg className="w-8 h-8 mx-auto text-emerald-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-gray-400 font-medium text-xs">ไม่มีเคสค้าง</p>
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
            <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-lg slide-in">
              <div className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 text-white px-4 py-2">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
                  </svg>
                  Ortho
                  <span className="text-white/80 text-xs font-normal ml-1">ศัลยกรรมกระดูก</span>
                </h2>
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {ORTHO_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div key={dept} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50/50 to-teal-50/50 px-3 py-2 rounded-lg border border-emerald-100/50">
                        <h3 className="text-sm font-bold text-gray-700">{dept}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cases.length > 0 ? 'bg-rose-100 text-rose-600 pulse-urgent' : 'bg-emerald-100 text-emerald-600'}`}>
                          {cases.length}
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-3 px-3 bg-gray-50/50 rounded-lg border border-gray-100/50">
                          <svg className="w-8 h-8 mx-auto text-emerald-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-gray-400 font-medium text-xs">ไม่มีเคสค้าง</p>
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