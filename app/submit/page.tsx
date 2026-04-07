"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { addConsult } from "@/lib/db";
import { ALL_DEPARTMENTS, ROOMS } from "@/lib/constants";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";

export default function SubmitPage() {
  const router = useRouter();
  const { darkMode } = useSettings();
  const { addToast } = useToast();
  const hnRef = useRef<HTMLInputElement>(null);
  const submitInFlightRef = useRef(false);

  const [hn, setHn] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [room, setRoom] = useState("");
  const [problem, setProblem] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isMac, setIsMac] = useState(false);

  // Auto-focus HN field on mount & detect OS
  useEffect(() => {
    hnRef.current?.focus();
    
    // Replace @ts-expect-error with a typed navigator narrow
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
    
    setIsMac(platform.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  const validateForm = useCallback(() => {
    const newErrors: { [key: string]: string } = {};

    if (!hn.trim()) {
      newErrors.hn = "กรุณากรอก HN";
    } else if (!/^\d+$/.test(hn.trim())) {
      newErrors.hn = "HN ต้องเป็นตัวเลขเท่านั้น";
    }

    if (!firstName.trim()) {
      newErrors.firstName = "กรุณากรอกชื่อ";
    }

    if (!lastName.trim()) {
      newErrors.lastName = "กรุณากรอกนามสกุล";
    }

    if (!room) {
      newErrors.room = "กรุณาเลือกห้องตรวจ";
    }

    if (!problem.trim()) {
      newErrors.problem = "กรุณากรอกรายละเอียดปัญหา";
    }

    if (selectedDepts.length === 0) {
      newErrors.departments = "กรุณาเลือกอย่างน้อย 1 แผนก";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [hn, firstName, lastName, room, problem, selectedDepts]);

  const handleCheckboxChange = (dept: string) => {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
    // Clear department error when user selects
    if (errors.departments) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.departments;
        return next;
      });
    }
  };

  const handleSubmit = useCallback(async (isUrgent: boolean = false) => {
    if (submitInFlightRef.current) return;

    if (!validateForm()) {
      addToast({ type: "error", message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      return;
    }

    submitInFlightRef.current = true;
    setIsLoading(true);

    const departmentsMap: Record<string, { status: "pending" | "completed" | "cancelled"; completedAt: string | null }> = {};
    selectedDepts.forEach((dept) => {
      departmentsMap[dept] = { status: "pending", completedAt: null };
    });

    try {
      await addConsult({
        hn: hn.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        room,
        problem: problem.trim(),
        isUrgent,
        departments: departmentsMap,
        status: "pending",
      });

      addToast({
        type: "success",
        message: isUrgent ? "✓ ส่งเคสปรึกษา FAST TRACK สำเร็จ!" : "✓ ส่งเคสปรึกษาสำเร็จ!",
        duration: 3000,
      });

      setHn("");
      setFirstName("");
      setLastName("");
      setRoom("");
      setProblem("");
      setSelectedDepts([]);
      setErrors({});

      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (error) {
      console.error("❌ Error:", error);
      addToast({
        type: "error",
        message: error instanceof Error ? `เกิดข้อผิดพลาด: ${error.message}` : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
        duration: 5000,
      });
    } finally {
      submitInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [validateForm, hn, firstName, lastName, room, problem, selectedDepts, addToast, router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (isLoading) return; // Prevent double submission
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          handleSubmit(false);
        } else if (e.shiftKey) {
          e.preventDefault();
          handleSubmit(true);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, isLoading]);

  const inputClasses = (fieldName: string) =>
    `w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 text-sm ${errors[fieldName]
      ? "border-[#E55143] focus:border-[#E55143] focus:ring-[#E55143]/20 bg-[#E55143]/5"
      : darkMode
        ? "border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400 focus:border-[#699D5D] focus:ring-[#699D5D]/20"
        : "border-[#C7CFDA]/30 bg-white text-[#014167] placeholder-[#C7CFDA] focus:border-[#699D5D] focus:ring-[#699D5D]/20"
    }`;

  const labelClasses = `flex items-center gap-1.5 text-xs font-bold mb-2 ${darkMode ? "text-gray-200" : "text-[#014167]"
    }`;

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-3 py-6 transition-colors duration-300 ${darkMode ? "bg-gray-900" : "bg-[#014167]"
        }`}
    >
      <div className="relative max-w-4xl w-full">
        <div
          className={`p-2.5 rounded-xl shadow-md mb-3 z-10 relative border transition-colors ${darkMode
              ? "bg-gray-700 text-gray-100 border-gray-600"
              : "bg-[#F1AE9E] text-[#014167] border-[#F1AE9E]/30"
            }`}
        >
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-8 h-8 backdrop-blur-sm rounded-lg flex items-center justify-center ${darkMode ? "bg-gray-600" : "bg-[#014167]/20"
                }`}
            >
              <svg
                className={`w-4 h-4 ${darkMode ? "text-gray-200" : "text-[#014167]"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold drop-shadow-sm">ส่งเคสปรึกษา</h1>
              <p className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>ER MNRH</p>
            </div>
          </div>
        </div>

        <div
          className={`p-5 md:p-6 rounded-xl shadow-md relative z-0 border transition-colors ${darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#C7CFDA]/30"
            }`}
        >
          <form className="space-y-4">
            <fieldset disabled={isLoading} className="space-y-4">
              {/* HN + Name row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="hn" className={labelClasses}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                    HN <span className="text-[#E55143]">*</span>
                  </label>
                  <input
                    ref={hnRef}
                    type="text"
                    id="hn"
                    inputMode="numeric"
                    value={hn}
                    onChange={(e) => {
                      setHn(e.target.value);
                      if (errors.hn) setErrors((prev) => { const n = { ...prev }; delete n.hn; return n; });
                    }}
                    className={inputClasses("hn")}
                    placeholder="เช่น 1234567"
                    required
                  />
                  {errors.hn && <p className="text-[#E55143] text-xs mt-1 font-medium">{errors.hn}</p>}
                </div>
                <div>
                  <label htmlFor="firstName" className={labelClasses}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    ชื่อ <span className="text-[#E55143]">*</span>
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((prev) => { const n = { ...prev }; delete n.firstName; return n; });
                    }}
                    className={inputClasses("firstName")}
                    placeholder="ชื่อผู้ป่วย"
                    required
                  />
                  {errors.firstName && <p className="text-[#E55143] text-xs mt-1 font-medium">{errors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="lastName" className={labelClasses}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    นามสกุล <span className="text-[#E55143]">*</span>
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName) setErrors((prev) => { const n = { ...prev }; delete n.lastName; return n; });
                    }}
                    className={inputClasses("lastName")}
                    placeholder="นามสกุลผู้ป่วย"
                    required
                  />
                  {errors.lastName && <p className="text-[#E55143] text-xs mt-1 font-medium">{errors.lastName}</p>}
                </div>
              </div>

              {/* Room */}
              <div>
                <label htmlFor="room" className={labelClasses}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  ห้องตรวจ <span className="text-[#E55143]">*</span>
                </label>
                <select
                  id="room"
                  value={room}
                  onChange={(e) => {
                    setRoom(e.target.value);
                    if (errors.room) setErrors((prev) => { const n = { ...prev }; delete n.room; return n; });
                  }}
                  className={inputClasses("room")}
                  required
                >
                  <option value="">เลือกห้องตรวจ</option>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {errors.room && <p className="text-[#E55143] text-xs mt-1 font-medium">{errors.room}</p>}
              </div>

              {/* Problem */}
              <div>
                <label htmlFor="problem" className={labelClasses}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  รายละเอียดปัญหา <span className="text-[#E55143]">*</span>
                </label>
                <textarea
                  id="problem"
                  value={problem}
                  onChange={(e) => {
                    setProblem(e.target.value);
                    if (errors.problem) setErrors((prev) => { const n = { ...prev }; delete n.problem; return n; });
                  }}
                  className={inputClasses("problem") + " min-h-[90px]"}
                  rows={3}
                  placeholder="เช่น TBI with GCS 9, Blunt abdomen..."
                  required
                />
                {errors.problem && <p className="text-[#E55143] text-xs mt-1 font-medium">{errors.problem}</p>}
              </div>

              {/* Departments */}
              <div>
                <label className={labelClasses}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  แผนกที่ปรึกษา <span className="text-[#E55143]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ALL_DEPARTMENTS.map((dept) => (
                    <div
                      key={dept}
                      className={`relative cursor-pointer transition-all duration-200 ${selectedDepts.includes(dept) ? "scale-105" : ""
                        }`}
                    >
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
                        className={`flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition-all duration-200 font-semibold text-xs ${selectedDepts.includes(dept)
                            ? "bg-[#699D5D] text-white border-[#699D5D] shadow-sm"
                            : darkMode
                              ? "bg-gray-700 text-gray-200 border-gray-600 hover:border-[#699D5D]/50 hover:bg-gray-600"
                              : "bg-white text-[#014167] border-[#C7CFDA] hover:border-[#699D5D]/50 hover:bg-[#C7CFDA]/30"
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
                {errors.departments && <p className="text-[#E55143] text-xs mt-1 font-medium">{errors.departments}</p>}
                {selectedDepts.length > 0 && (
                  <div
                    className={`mt-2 p-2 rounded-lg border ${darkMode
                        ? "bg-[#699D5D]/10 border-[#699D5D]/30"
                        : "bg-[#699D5D]/10 border-[#699D5D]/30"
                      }`}
                  >
                    <p className={`text-xs font-medium ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
                      ✓ {selectedDepts.length} แผนก:{" "}
                      <span className="font-bold">{selectedDepts.join(", ")}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Submit buttons */}
              <div className={`pt-3 border-t ${darkMode ? "border-gray-700" : "border-[#C7CFDA]/30"}`}>
                <div className={`text-[10px] mb-2 text-center flex flex-col gap-0.5 ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>
                  <p>💡 {isMac ? "⌘+Enter" : "Ctrl+Enter"}: ส่งเคสปกติ</p>
                  <p>⚡ Shift+Enter: ส่ง Fast Track</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={isLoading}
                    className={`font-bold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-sm text-sm flex items-center justify-center gap-2 ${isLoading
                        ? "bg-[#C7CFDA] cursor-not-allowed text-[#014167]"
                        : "bg-[#699D5D] text-white hover:shadow-md transform hover:-translate-y-0.5"
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
                    className={`font-bold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-sm text-sm flex items-center justify-center gap-2 ${isLoading
                        ? "bg-[#C7CFDA] cursor-not-allowed text-[#014167]"
                        : "bg-[#E55143] text-white hover:shadow-md transform hover:-translate-y-0.5"
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
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}
