"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function SubmitPage() {
  const router = useRouter();
  const [hn, setHn] = useState("");
  const [room, setRoom] = useState("");
  const [problem, setProblem] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const rooms = ["Resus Team 1", "Resus Team 2", "Resus Team 3", "Resus Team 4", "Urgent", "NT"];
  
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

  const handleSubmit = async (isUrgent: boolean = false) => {
    if (!hn || !room || !problem || selectedDepts.length === 0) {
      setSubmitStatus({
        type: 'error',
        message: 'กรุณากรอกข้อมูลให้ครบ (HN, ห้องตรวจ, Problem, และเลือกอย่างน้อย 1 แผนก)'
      });
      setTimeout(() => setSubmitStatus(null), 4000);
      return;
    }

    setIsLoading(true);
    setSubmitStatus(null);

    const departmentsMap: { [key: string]: any } = {};
    selectedDepts.forEach(dept => {
      departmentsMap[dept] = { status: "pending", completedAt: null };
    });

    try {
      console.log("📤 Submitting case to Firestore...");
      console.log("Data:", {
        hn,
        room,
        problem: problem.substring(0, 50) + "...",
        isUrgent,
        departments: Object.keys(departmentsMap)
      });

      const docRef = await addDoc(collection(db, "consults"), {
        hn: hn,
        room: room,
        problem: problem,
        createdAt: serverTimestamp(),
        status: "pending",
        isUrgent: isUrgent,
        departments: departmentsMap
      });

      console.log("✓ Document written with ID:", docRef.id);

      setSubmitStatus({
        type: 'success',
        message: isUrgent ? '✓ ส่งเคสปรึกษาด่วนสำเร็จ!' : '✓ ส่งเคสปรึกษาสำเร็จ!'
      });

      setHn("");
      setRoom("");
      setProblem("");
      setSelectedDepts([]);

      setTimeout(() => {
        router.push('/');
      }, 1500);

    } catch (error) {
      console.error("❌ Error adding document:", error);
      if (error instanceof Error) {
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? `เกิดข้อผิดพลาด: ${error.message}` : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
      });
      setTimeout(() => setSubmitStatus(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-3 py-6">
      <div className="relative max-w-4xl w-full">
        <div className="bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-500 text-white p-2.5 rounded-xl shadow-md mb-3 z-10 relative border border-blue-300/30">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-white/30 backdrop-blur-sm rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold drop-shadow-sm">ส่งเคสปรึกษา</h1>
              <p className="text-white/90 text-xs">ER MNRH</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 md:p-6 rounded-xl shadow-md relative z-0 border border-gray-100">
          {submitStatus && (
            <div className={`mb-4 p-4 rounded-lg border flex items-center gap-3 animate-pulse ${
              submitStatus.type === 'success' 
                ? 'bg-emerald-50 border-emerald-400 text-emerald-700' 
                : 'bg-rose-50 border-rose-400 text-rose-700'
            }`}>
              {submitStatus.type === 'success' ? (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <p className="font-semibold">{submitStatus.message}</p>
            </div>
          )}
          <form className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="hn" className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                  HN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="hn"
                  value={hn}
                  onChange={(e) => setHn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-200 text-sm"
                  placeholder="เช่น 1234567"
                  required
                />
              </div>
              <div>
                <label htmlFor="room" className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  ห้องตรวจ <span className="text-rose-500">*</span>
                </label>
                <select
                  id="room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-200 text-sm"
                  required
                >
                  <option value="">เลือกห้องตรวจ</option>
                  {rooms.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="problem" className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                รายละเอียดปัญหา <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-200 min-h-[90px] text-sm"
                rows={3}
                placeholder="เช่น TBI with GCS 9, Blunt abdomen..."
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                แผนกที่ปรึกษา <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {allDepartments.map(dept => (
                  <div key={dept} className={`relative cursor-pointer transition-all duration-200 ${selectedDepts.includes(dept) ? 'scale-105' : ''}`}>
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
                      className={`flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition-all duration-200 font-semibold text-xs
                        ${selectedDepts.includes(dept)
                          ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white border-blue-500 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                    >
                      {selectedDepts.includes(dept) && (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {dept}
                    </label>
                  </div>
                ))}
              </div>
              {selectedDepts.length > 0 && (
                <div className="mt-2 p-2 bg-blue-50/60 border border-blue-200/60 rounded-lg">
                  <p className="text-xs text-blue-700 font-medium">
                    ✓ {selectedDepts.length} แผนก: <span className="font-bold">{selectedDepts.join(', ')}</span>
                  </p>
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={isLoading}
                  className={`font-bold py-2.5 px-4 rounded-lg transition-all duration-200 text-white shadow-sm text-sm flex items-center justify-center gap-2
                    ${isLoading
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 hover:shadow-md transform hover:-translate-y-0.5'
                    }`}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="hidden sm:inline">กำลังส่ง...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Consult
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={isLoading}
                  className={`font-bold py-2.5 px-4 rounded-lg transition-all duration-200 text-white shadow-sm text-sm flex items-center justify-center gap-2
                    ${isLoading
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-rose-400 to-rose-500 hover:from-rose-500 hover:to-pink-500 hover:shadow-md transform hover:-translate-y-0.5'
                    }`}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="hidden sm:inline">กำลังส่ง...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Consult FastTrack
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}