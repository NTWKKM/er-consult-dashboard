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
          <div className="inline-block w-16 h-16 border-4 border-[#bb1515] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xl text-[#e0cda7] font-semibold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-gradient-to-br from-[#2a344f] to-[#1a1f2e] rounded-xl shadow-lg p-8 max-w-md border border-[#bb1515]/30">
          <svg className="w-16 h-16 mx-auto text-[#bb1515] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-[#e0cda7] mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-[#8b8b8b] mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 accent-gradient-cream text-[#000000] rounded-lg font-bold hover:shadow-lg transition-all glow-hover"
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
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5">
        <div className="mb-4 text-center slide-in">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 accent-gradient-red rounded-lg flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#e0cda7]">
              ER Consult Dashboard
            </h1>
          </div>
          <p className="text-[#8b8b8b] text-sm font-bold mb-3">MNRH</p>
          <div className="inline-flex items-center gap-3 bg-gradient-to-br from-[#2a344f] to-[#1a1f2e] px-6 py-2 rounded-full shadow-lg border border-[#e0cda7]/30">
            <span className="text-[#e0cda7] font-bold">เคสรอดำเนินการ:</span>
            <span className={`text-2xl font-bold ${totalPendingCases > 0 ? 'text-[#bb1515] pulse-urgent' : 'text-[#e0cda7]'}`}>
              {totalPendingCases}
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-5 flex-wrap">
          <button
            className={`px-5 py-2 rounded-lg font-bold shadow-md transition-all duration-200 text-sm glow-hover
              ${view === 'surgery' 
                ? 'accent-gradient-red text-white' 
                : 'bg-[#2a344f] text-[#bb1515] border border-[#bb1515]/50 hover:border-[#bb1515]'}
            `}
            onClick={() => setView('surgery')}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Surgery
            </span>
          </button>
          <button
            className={`px-5 py-2 rounded-lg font-bold shadow-md transition-all duration-200 text-sm glow-hover
              ${view === 'ortho' 
                ? 'accent-gradient-cream text-[#000000]' 
                : 'bg-[#2a344f] text-[#e0cda7] border border-[#e0cda7]/50 hover:border-[#e0cda7]'}
            `}
            onClick={() => setView('ortho')}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
              </svg>
              Ortho
            </span>
          </button>
          <button
            className={`px-5 py-2 rounded-lg font-bold shadow-md transition-all duration-200 text-sm glow-hover
              ${view === 'both' 
                ? 'bg-gradient-to-r from-[#bb1515] to-[#e0cda7] text-white' 
                : 'bg-[#2a344f] text-[#8b8b8b] border border-[#8b8b8b]/50 hover:border-[#8b8b8b]'}
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

        <div className="flex flex-col lg:flex-row gap-4">
          {(view === 'surgery' || view === 'both') && (
            <div className="flex-1 bg-gradient-to-br from-[#2a344f] to-[#1a1f2e] rounded-xl shadow-lg border border-[#bb1515]/30 overflow-hidden transition-all duration-300 hover:shadow-2xl slide-in">
              <div className="accent-gradient-red text-white px-5 py-3 border-b border-[#bb1515]/20">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  Surgery
                  <span className="text-white/80 text-sm font-normal ml-1">แผนกศัลยกรรม</span>
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {SURGERY_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div key={dept} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between bg-[#000000]/60 px-3 py-2 rounded-lg border border-[#bb1515]/20">
                        <h3 className="text-sm font-bold text-[#e0cda7]">{dept}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cases.length > 0 ? 'bg-[#bb1515]/20 text-[#bb1515] pulse-urgent' : 'bg-[#e0cda7]/20 text-[#e0cda7]'}`}>
                          {cases.length}
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-4 px-3 bg-[#000000]/40 rounded-lg border border-[#e0cda7]/10">
                          <svg className="w-10 h-10 mx-auto text-[#e0cda7] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-[#8b8b8b] font-medium text-xs">ไม่มีเคสค้าง</p>
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
            <div className="flex-1 bg-gradient-to-br from-[#2a344f] to-[#1a1f2e] rounded-xl shadow-lg border border-[#e0cda7]/30 overflow-hidden transition-all duration-300 hover:shadow-2xl slide-in">
              <div className="accent-gradient-cream text-[#000000] px-5 py-3 border-b border-[#e0cda7]/20">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
                  </svg>
                  Ortho
                  <span className="text-[#000000]/70 text-sm font-normal ml-1">ศัลยกรรมกระดูก</span>
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {ORTHO_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div key={dept} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between bg-[#000000]/60 px-3 py-2 rounded-lg border border-[#e0cda7]/20">
                        <h3 className="text-sm font-bold text-[#e0cda7]">{dept}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cases.length > 0 ? 'bg-[#bb1515]/20 text-[#bb1515] pulse-urgent' : 'bg-[#e0cda7]/20 text-[#e0cda7]'}`}>
                          {cases.length}
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-4 px-3 bg-[#000000]/40 rounded-lg border border-[#e0cda7]/10">
                          <svg className="w-10 h-10 mx-auto text-[#e0cda7] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-[#8b8b8b] font-medium text-xs">ไม่มีเคสค้าง</p>
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
