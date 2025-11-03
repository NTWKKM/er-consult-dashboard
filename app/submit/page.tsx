"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function SubmitPage() {
  const [hn, setHn] = useState("");
  const [problem, setProblem] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const allDepartments = [
    "Gen Sx", "Sx Trauma", "Ortho", "Neuro Sx",
    "Sx Vascular", "Sx Plastic", "Uro Sx", "CVT"
  ];

  const handleCheckboxChange = (dept: string) => {
    setSelectedDepts(prev =>
      prev.includes(dept)
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hn || !problem || selectedDepts.length === 0) {
      alert("กรุณากรอกข้อมูลให้ครบ (HN, Problem, และเลือกอย่างน้อย 1 แผนก)");
      return;
    }

    setIsLoading(true);

    const departmentsMap: { [key: string]: any } = {};
    selectedDepts.forEach(dept => {
      departmentsMap[dept] = { status: "pending", completedAt: null };
    });

    try {
      await addDoc(collection(db, "consults"), {
        hn: hn,
        problem: problem,
        createdAt: serverTimestamp(),
        status: "pending",
        departments: departmentsMap
      });

      alert("ส่งเคสปรึกษาสำเร็จ!");
      setHn("");
      setProblem("");
      setSelectedDepts([]);

    } catch (error) {
      console.error("Error adding document: ", error);
      if (error instanceof Error) {
        alert("เกิดข้อผิดพลาด: " + error.message);
      } else {
        alert("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4 py-12">
      <div className="relative max-w-3xl w-full">
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white p-8 rounded-2xl shadow-2xl -mb-12 z-10 relative border-4 border-white">
          <div className="flex items-center justify-center gap-4 mb-2">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-bold">
                ส่งเคสปรึกษา
              </h1>
              <p className="text-blue-100 text-sm mt-1">Emergency Room Consultation Form</p>
            </div>
          </div>
          <p className="text-center text-blue-50 font-medium mt-2">Maharaj Hospital (MNRH)</p>
        </div>
        <div className="bg-white pt-20 p-8 md:p-10 rounded-2xl shadow-2xl relative z-0 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="hn" className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
                Hospital Number (HN) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="hn"
                value={hn}
                onChange={(e) => setHn(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                placeholder="กรอก HN ผู้ป่วย เช่น 1234567"
                required
              />
            </div>
            <div>
              <label htmlFor="problem" className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                รายละเอียดปัญหา <span className="text-red-500">*</span>
              </label>
              <textarea
                id="problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200 min-h-[120px]"
                rows={5}
                placeholder="เช่น TBI with GCS 9, Blunt abdomen with unstable vital signs..."
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                เลือกแผนกที่ต้องการปรึกษา <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {allDepartments.map(dept => (
                  <div key={dept} className={`relative cursor-pointer transition-all duration-200 ${selectedDepts.includes(dept) ? 'scale-105' : 'hover:scale-102'}`}>
                    <input
                      type="checkbox"
                      id={dept}
                      value={dept}
                      checked={selectedDepts.includes(dept)}
                      onChange={() => handleCheckboxChange(dept)}
                      className="peer hidden"
                    />
                    <label 
                      htmlFor={dept} 
                      className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 font-semibold text-sm
                        ${selectedDepts.includes(dept)
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-700 shadow-lg'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                    >
                      {selectedDepts.includes(dept) && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {dept}
                    </label>
                  </div>
                ))}
              </div>
              {selectedDepts.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium">
                    ✓ เลือกแล้ว {selectedDepts.length} แผนก: <span className="font-bold">{selectedDepts.join(', ')}</span>
                  </p>
                </div>
              )}
            </div>
            <div className="pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full font-bold py-4 px-6 rounded-xl transition-all duration-200 text-white shadow-lg text-lg flex items-center justify-center gap-3
                  ${isLoading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 hover:shadow-xl transform hover:-translate-y-0.5'
                  }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังส่งข้อมูล...
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    ส่งเคสปรึกษา
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}