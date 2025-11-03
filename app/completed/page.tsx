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
            className="px-4 py-2 bg-gradient-to-r from-blue-400 to-blue-500 text-white rounded-lg font-semibold hover:from-blue-500 hover:to-cyan-500 transition-all shadow-sm"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-[1800px] mx-auto p-4">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-500 bg-clip-text text-transparent mb-2">
            เคสที่ปรึกษาเสร็จแล้ว
          </h1>
          <p className="text-gray-500 text-sm">แสดง 100 เคสล่าสุด</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-white px-4 py-1.5 rounded-full shadow-sm border border-gray-100">
            <span className="text-gray-600 font-semibold text-sm">ทั้งหมด:</span>
            <span className="text-xl font-bold text-blue-500">{cases.length}</span>
            <span className="text-gray-400 text-sm">เคส</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-500 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold">HN</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">ห้อง</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">ปัญหา</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">แผนก</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">วันที่ส่ง</th>
                  <th className="px-4 py-3 text-center text-sm font-bold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                ) : (
                  currentCases.map((caseData) => (
                    <tr key={caseData.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                        {caseData.hn}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-500 font-medium">
                        {caseData.room}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                        <div className="line-clamp-2">{caseData.problem}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(caseData.departments).map(dept => (
                            <span key={dept} className="inline-block px-2 py-0.5 bg-gray-100/60 text-gray-600 rounded text-xs font-medium">
                              {dept}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
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
                          className="px-3 py-1.5 bg-gradient-to-r from-orange-400 to-orange-500 text-white rounded-lg text-xs font-bold hover:from-orange-500 hover:to-amber-500 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-1 mx-auto"
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
            <div className="bg-gray-50/60 px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                แสดง {startIndex + 1}-{Math.min(endIndex, cases.length)} จาก {cases.length} เคส
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    currentPage === 1
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      : 'bg-white text-blue-500 border border-blue-200 hover:bg-blue-50'
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
                          ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-sm'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
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
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      : 'bg-white text-blue-500 border border-blue-200 hover:bg-blue-50'
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
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Re-consult เคส HN: {selectedCase?.hn}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-300 hover:text-gray-500 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50/60 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-500 font-semibold mb-1">ปัญหาเดิม:</p>
              <p className="text-sm text-gray-600">{selectedCase?.problem}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-600 mb-2">
                แผนกที่ต้องการส่งปรึกษา <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_DEPARTMENTS.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDepartment(dept)}
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      selectedDepartments.includes(dept)
                        ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-sm'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                เลือกได้หลายแผนก (คลิกเพื่อเลือก/ยกเลิก)
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-600 mb-2">
                ปัญหาใหม่ / อาการเพิ่มเติม <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-200 min-h-[120px] text-sm"
                placeholder="ระบุปัญหาใหม่หรืออาการเพิ่มเติมที่ต้องการปรึกษา..."
                required
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200 transition-all text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReConsult}
                disabled={isUpdating || !newProblem.trim() || selectedDepartments.length === 0}
                className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
                  isUpdating || !newProblem.trim() || selectedDepartments.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-400 to-orange-500 text-white hover:from-orange-500 hover:to-amber-500 shadow-sm hover:shadow-md'
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
