"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function CompletedPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [newProblem, setNewProblem] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const ITEMS_PER_PAGE = 25;
  const ALL_DEPARTMENTS = ["Gen Sx", "Sx Trauma", "Neuro Sx", "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT", "Ortho"];

  useEffect(() => {
    const q = query(
      collection(db, "consults"),
      where("status", "==", "completed"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const completedCases: any[] = [];
        querySnapshot.forEach((doc) => {
          completedCases.push({ id: doc.id, ...doc.data() });
        });
        setCases(completedCases);
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

  const handleReConsult = async () => {
    if (!selectedCase || !newProblem.trim()) {
      alert("กรุณาระบุปัญหาใหม่");
      return;
    }

    if (selectedDepartments.length === 0) {
      alert("กรุณาเลือกอย่างน้อย 1 แผนก");
      return;
    }

    setIsUpdating(true);

    try {
      const updatedDepartments: any = {};
      selectedDepartments.forEach(dept => {
        updatedDepartments[dept] = {
          status: "pending",
          completedAt: null
        };
      });

      const caseRef = doc(db, "consults", selectedCase.id);
      await updateDoc(caseRef, {
        status: "pending",
        departments: updatedDepartments,
        problem: `${selectedCase.problem}\n\n[Re-consult]: ${newProblem}`,
        createdAt: serverTimestamp()
      });

      setShowModal(false);
      setSelectedCase(null);
      setNewProblem("");
      setSelectedDepartments([]);
      alert("✓ ส่งปรึกษาใหม่สำเร็จ!");

    } catch (error) {
      console.error("Error re-consulting:", error);
      alert("เกิดข้อผิดพลาด");
    } finally {
      setIsUpdating(false);
    }
  };

  const openReConsultModal = (caseData: any) => {
    setSelectedCase(caseData);
    setNewProblem("");
    setSelectedDepartments(Object.keys(caseData.departments));
    setShowModal(true);
  };

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev =>
      prev.includes(dept)
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  const totalPages = Math.ceil(cases.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentCases = cases.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#014167] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#E55143] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-xl text-[#FDFCDF] font-semibold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#014167] flex items-center justify-center p-4">
        <div className="text-center bg-[#C7CFDA] rounded-xl shadow-md p-8 max-w-md border border-[#C7CFDA]/30">
          <svg className="w-16 h-16 mx-auto text-[#E55143] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-[#014167] mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-[#014167] font-medium mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#E55143] text-white rounded-lg font-semibold hover:shadow-md transition-all"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#014167]">
      <div className="max-w-[1800px] mx-auto p-4">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-[#FDFCDF] mb-2">
            เคสที่ปรึกษาเสร็จแล้ว
          </h1>
          <p className="text-[#C7CFDA] text-sm font-medium">แสดง 100 เคสล่าสุด</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-[#C7CFDA] px-4 py-1.5 rounded-full shadow-sm border border-[#C7CFDA]/30">
            <span className="text-[#014167] font-semibold text-sm">ทั้งหมด:</span>
            <span className="text-xl font-bold text-[#014167]">{cases.length}</span>
            <span className="text-[#014167] text-sm font-medium">เคส</span>
          </div>
        </div>

        <div className="bg-[#C7CFDA] rounded-xl shadow-md overflow-hidden border border-[#C7CFDA]/30">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#E55143] text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold">HN</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">ห้อง</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">ปัญหา</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">แผนก</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">วันที่ส่ง</th>
                  <th className="px-4 py-3 text-center text-sm font-bold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#014167]/10">
                {currentCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#014167] font-medium">
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                ) : (
                  currentCases.map((caseData) => (
                    <tr key={caseData.id} className="hover:bg-[#014167]/10 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-[#014167]">
                        {caseData.hn}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#014167] font-medium">
                        {caseData.room}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#014167] max-w-md">
                        <div className="line-clamp-2">{caseData.problem}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(caseData.departments).map(dept => (
                            <span key={dept} className="inline-block px-2 py-0.5 bg-[#F1AE9E] text-[#014167] rounded text-xs font-medium border border-[#F1AE9E]/30">
                              {dept}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#014167] font-medium">
                        {caseData.createdAt
                          ? new Date(caseData.createdAt.seconds * 1000).toLocaleDateString("th-TH", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openReConsultModal(caseData)}
                          className="px-3 py-1.5 bg-[#F1AE9E] text-[#014167] rounded-lg text-xs font-bold hover:shadow-md transition-all duration-200 flex items-center gap-1 mx-auto"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Re-consult
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="bg-[#014167]/10 px-4 py-3 border-t border-[#014167]/20 flex items-center justify-between">
              <div className="text-sm text-[#014167] font-medium">
                แสดง {startIndex + 1}-{Math.min(endIndex, cases.length)} จาก {cases.length} เคส
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    currentPage === 1
                      ? 'bg-[#C7CFDA] text-[#014167] cursor-not-allowed'
                      : 'bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30'
                  }`}
                >
                  ← ก่อนหน้า
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                        currentPage === page
                          ? 'bg-[#699D5D] text-white shadow-sm'
                          : 'bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    currentPage === totalPages
                      ? 'bg-[#C7CFDA] text-[#014167] cursor-not-allowed'
                      : 'bg-white text-[#014167] border border-[#C7CFDA] hover:bg-[#C7CFDA]/30'
                  }`}
                >
                  ถัดไป →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-[#000000]/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#C7CFDA] rounded-xl shadow-xl max-w-2xl w-full p-6 border border-[#C7CFDA]/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#014167]">Re-consult เคส HN: {selectedCase?.hn}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#014167] hover:text-[#E55143] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-white rounded-lg border border-[#C7CFDA]">
              <p className="text-xs text-[#014167] font-semibold mb-1">ปัญหาเดิม:</p>
              <p className="text-sm text-[#014167]">{selectedCase?.problem}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-[#014167] mb-2">
                แผนกที่ต้องการส่งปรึกษา <span className="text-[#E55143]">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_DEPARTMENTS.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDepartment(dept)}
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      selectedDepartments.includes(dept)
                        ? 'bg-[#699D5D] text-white shadow-sm'
                        : 'bg-white text-[#014167] hover:bg-[#C7CFDA]/30 border border-[#C7CFDA]'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#014167] font-medium mt-2">
                เลือกได้หลายแผนก (คลิกเพื่อเลือก/ยกเลิก)
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-[#014167] mb-2">
                ปัญหาใหม่ / อาการเพิ่มเติม <span className="text-[#E55143]">*</span>
              </label>
              <textarea
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                className="w-full px-3 py-2 border border-[#C7CFDA] rounded-lg bg-white text-[#014167] placeholder-[#C7CFDA] focus:outline-none focus:border-[#699D5D] focus:ring-2 focus:ring-[#699D5D]/20 transition-all duration-200 min-h-[120px] text-sm"
                placeholder="ระบุปัญหาใหม่หรืออาการเพิ่มเติมที่ต้องการปรึกษา..."
                required
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-white text-[#014167] border border-[#C7CFDA] rounded-lg font-semibold hover:bg-[#C7CFDA]/30 transition-all text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReConsult}
                disabled={isUpdating || !newProblem.trim() || selectedDepartments.length === 0}
                className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
                  isUpdating || !newProblem.trim() || selectedDepartments.length === 0
                    ? 'bg-[#C7CFDA] text-[#014167] cursor-not-allowed'
                    : 'bg-[#699D5D] text-white hover:shadow-md'
                }`}
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>กำลังส่ง...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>ส่งปรึกษาใหม่</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
