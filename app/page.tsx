"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  
  const deptRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  const scrollToDepartment = (deptName: string) => {
    deptRefs.current[deptName]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
      const filtered = allCases.filter(caseData =>
        caseData.departments[dept]
        && caseData.departments[dept].status === 'pending'
      );
      
      // เรียงลำดับ: เคสด่วนขึ้นก่อน จากนั้นเรียงตามเวลา (เคสที่มาก่อนขึ้นก่อน)
      map[dept] = filtered.sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        return b.createdAt?.seconds - a.createdAt?.seconds;
      });
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
          <div className="inline-block w-16 h-16 border-4 border-[#E55143] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xl text-[#FDFCDF] font-semibold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-[#C7CFDA] rounded-xl shadow-lg p-8 max-w-md border border-[#E55143]/30">
          <svg className="w-16 h-16 mx-auto text-[#E55143] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-[#014167] mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-[#014167] mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#699D5D] text-[#FDFCDF] rounded-lg font-bold hover:shadow-lg transition-all glow-hover"
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
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#E55143] rounded-lg flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#FDFCDF]">
              ER-MNRH Consult Dashboard
            </h1>
          </div>
          <div className="flex flex-row flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-3 bg-[#C7CFDA] px-6 py-2 rounded-full shadow-lg border border-[#014167]/30">
              <span className="text-[#014167] font-bold">เคสรอดำเนินการ:</span>
              <span className={`text-2xl font-bold ${totalPendingCases > 0 ? 'text-[#E55143] pulse-urgent' : 'text-[#014167]'}`}>
                {totalPendingCases}
              </span>
            </div>
            <button
              className={`px-4 py-2 rounded-lg font-bold shadow-md transition-all duration-200 text-xs glow-hover
                ${view === 'surgery' 
                  ? 'bg-[#E55143] text-white' 
                  : 'bg-[#C7CFDA] text-[#E55143] border border-[#E55143]/50 hover:border-[#E55143]'}
              `}
              onClick={() => setView('surgery')}
            >
              Surgery
            </button>
            <button
              className={`px-4 py-2 rounded-lg font-bold shadow-md transition-all duration-200 text-xs glow-hover
                ${view === 'ortho' 
                  ? 'bg-[#699D5D] text-[#FDFCDF]' 
                  : 'bg-[#C7CFDA] text-[#699D5D] border border-[#699D5D]/50 hover:border-[#699D5D]'}
              `}
              onClick={() => setView('ortho')}
            >
              Ortho
            </button>
            <button
              className={`px-4 py-2 rounded-lg font-bold shadow-md transition-all duration-200 text-xs glow-hover
                ${view === 'both' 
                  ? 'bg-[#F1AE9E] text-[#014167]' 
                  : 'bg-[#C7CFDA] text-[#014167] border border-[#014167]/50 hover:border-[#014167]'}
              `}
              onClick={() => setView('both')}
            >
              Both
            </button>
          </div>
        </div>

        <details className="mb-4 bg-[#C7CFDA] rounded-xl shadow-md border border-[#014167]/20 overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 font-bold text-[#014167] hover:bg-[#014167]/10 transition-all flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Quick Navigation
            </span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="p-4 border-t border-[#014167]/10">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {[...SURGERY_DEPTS, ...ORTHO_DEPTS].map(dept => {
                const cases = getCasesForDepartment(dept);
                const isSurgery = SURGERY_DEPTS.includes(dept);
                return (
                  <button
                    key={dept}
                    onClick={() => scrollToDepartment(dept)}
                    className={`bg-white hover:text-white text-[#014167] rounded-lg px-3 py-2 transition-all duration-200 shadow-sm hover:shadow-md group ${
                      isSurgery 
                        ? 'border border-[#E55143]/30 hover:bg-[#E55143]' 
                        : 'border border-[#699D5D]/30 hover:bg-[#699D5D]'
                    }`}
                  >
                    <div className="text-xs font-bold mb-1">{dept}</div>
                    <div className={`text-lg font-bold ${cases.length > 0 ? 'text-[#E55143] group-hover:text-white' : 'text-[#699D5D] group-hover:text-white'}`}>
                      {cases.length}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </details>

        <div className="flex flex-col lg:flex-row gap-4">
          {(view === 'surgery' || view === 'both') && (
            <div className="flex-1 bg-[#C7CFDA] rounded-xl shadow-lg border border-[#E55143]/30 overflow-hidden transition-all duration-300 hover:shadow-2xl slide-in">
              <div className="bg-[#E55143] text-white px-5 py-3 border-b border-[#E55143]/20">
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
                    <div 
                      key={dept} 
                      className="flex flex-col gap-2"
                      ref={(el) => { deptRefs.current[dept] = el; }}
                    >
                      <div className="flex items-center justify-between bg-[#014167] px-3 py-2 rounded-lg border border-[#E55143]/20">
                        <h3 className="text-sm font-bold text-[#FDFCDF]">{dept}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cases.length > 0 ? 'bg-[#E55143]/20 text-[#E55143] pulse-urgent' : 'bg-[#699D5D]/20 text-[#699D5D]'}`}>
                          {cases.length}
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-4 px-3 bg-[#014167]/40 rounded-lg border border-[#FDFCDF]/10">
                          <svg className="w-10 h-10 mx-auto text-[#FDFCDF] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-[#014167] font-medium text-xs">ไม่มีเคสค้าง</p>
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
            <div className="flex-1 bg-[#C7CFDA] rounded-xl shadow-lg border border-[#699D5D]/30 overflow-hidden transition-all duration-300 hover:shadow-2xl slide-in">
              <div className="bg-[#699D5D] text-[#FDFCDF] px-5 py-3 border-b border-[#699D5D]/20">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
                  </svg>
                  Ortho
                  <span className="text-[#C7CFDA] text-sm font-normal ml-1">ศัลยกรรมกระดูก</span>
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {ORTHO_DEPTS.map(dept => {
                  const cases = getCasesForDepartment(dept);
                  return (
                    <div 
                      key={dept} 
                      className="flex flex-col gap-2"
                      ref={(el) => { deptRefs.current[dept] = el; }}
                    >
                      <div className="flex items-center justify-between bg-[#014167] px-3 py-2 rounded-lg border border-[#699D5D]/20">
                        <h3 className="text-sm font-bold text-[#FDFCDF]">{dept}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cases.length > 0 ? 'bg-[#E55143]/20 text-[#E55143] pulse-urgent' : 'bg-[#699D5D]/20 text-[#699D5D]'}`}>
                          {cases.length}
                        </span>
                      </div>
                      {cases.length === 0 ? (
                        <div className="text-center py-4 px-3 bg-[#014167]/40 rounded-lg border border-[#FDFCDF]/10">
                          <svg className="w-10 h-10 mx-auto text-[#FDFCDF] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-[#014167] font-medium text-xs">ไม่มีเคสค้าง</p>
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
