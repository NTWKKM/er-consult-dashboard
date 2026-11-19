"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { addConsult } from "@/lib/db";
import { ALL_DEPARTMENTS, ROOMS, RoomName } from "@/lib/constants";
import { useToast } from "../contexts/ToastContext";
import { usePendingConsults } from "../contexts/ConsultsContext";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

export default function SubmitPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { cases: activePendingCases } = usePendingConsults();
  const isOnline = useNetworkStatus();
  const hnRef = useRef<HTMLInputElement>(null);
  const submitInFlightRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const [hn, setHn] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [room, setRoom] = useState<RoomName | "">("");
  const [problem, setProblem] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isMac, setIsMac] = useState(false);

  // Auto-focus HN field on mount & detect OS
  useEffect(() => {
    hnRef.current?.focus();
    
    let active = true;
    // Replace @ts-expect-error with a typed navigator narrow
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
    
    void Promise.resolve().then(() => {
      if (active) {
        setIsMac(platform.toUpperCase().indexOf('MAC') >= 0);
      }
    });
    return () => {
      active = false;
    };
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
    return newErrors;
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

  // Zero-read duplicate consult detection against already-subscribed pending cases
  const duplicatePendingMatches = useMemo(() => {
    const trimmedHn = hn.trim();
    if (!trimmedHn || selectedDepts.length === 0) return [];
    const matches: { dept: string; room: string }[] = [];
    const seen = new Set<string>();
    for (const c of activePendingCases) {
      if (c.hn.trim() !== trimmedHn) continue;
      for (const dept of selectedDepts) {
        if (c.departments[dept]?.status === "pending" && !seen.has(dept)) {
          seen.add(dept);
          matches.push({ dept, room: c.room });
        }
      }
    }
    return matches;
  }, [hn, selectedDepts, activePendingCases]);

  const handleSubmit = useCallback(async (isUrgent: boolean = false) => {
    if (submitInFlightRef.current) return;

    const currentErrors = validateForm();
    if (Object.keys(currentErrors).length > 0) {
      addToast({ type: "error", message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      
      // UX Improvement: Auto-focus and scroll to the first error field
      const firstErrorKey = Object.keys(currentErrors)[0];
      setTimeout(() => {
        const errorElement = document.getElementById(firstErrorKey);
        if (errorElement) {
          errorElement.focus();
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    submitInFlightRef.current = true;
    setIsLoading(true);

    const departmentsMap: Record<string, { status: "pending" | "completed" | "cancelled"; completedAt: string | null }> = {};
    selectedDepts.forEach((dept) => {
      departmentsMap[dept] = { status: "pending", completedAt: null };
    });

    try {
      const payload = {
        hn: hn.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        room: room as RoomName,
        problem: problem.trim(),
        isUrgent,
        departments: departmentsMap,
        status: "pending" as const,
      };
      if (isOnline) {
        await addConsult(payload);
      } else {
        await addConsult(payload, {
          awaitRemote: false,
          onBackgroundError: () => {
            addToast({
              type: "error",
              message: "ซิงค์เคสที่บันทึกขณะออฟไลน์ไม่สำเร็จ กรุณาตรวจสอบบนหน้าหลัก",
            });
          },
        });
      }

      addToast({
        type: "success",
        message: !isOnline
          ? "✓ บันทึกเคสในเครื่องแล้ว (จะซิงค์อัตโนมัติเมื่อกลับมาออนไลน์)"
          : isUrgent
            ? "✓ ส่งเคสปรึกษา FAST TRACK สำเร็จ!"
            : "✓ ส่งเคสปรึกษาสำเร็จ!",
        duration: 3000,
      });

      if (!isMountedRef.current) return;

      setHn("");
      setFirstName("");
      setLastName("");
      setRoom("");
      setProblem("");
      setSelectedDepts([]);
      setErrors({});

      redirectTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          router.push("/");
        }
      }, 1500);
    } catch (error) {
      console.error("Submit consult error:", error instanceof Error ? error.message : "unknown");
      if (!isMountedRef.current) return;
      addToast({
        type: "error",
        message: error instanceof Error ? `เกิดข้อผิดพลาด: ${error.message}` : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
        duration: 5000,
      });
      submitInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [validateForm, hn, firstName, lastName, room, problem, selectedDepts, addToast, router, isOnline]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (redirectTimerRef.current !== null) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (isLoading) return; // Prevent double submission
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          handleSubmit(true); // Cmd/Ctrl + Enter triggers Fast Track
        }
        // Enter and Shift + Enter are now free to create newlines in textarea
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, isLoading]);

  const inputClasses = (fieldName: string) =>
    `w-full px-3 py-2.5 border rounded-[6px] focus:outline-none focus:ring-2 transition-colors duration-200 text-sm ${
      errors[fieldName]
        ? "border-bad focus:border-bad focus:ring-bad/25 bg-bad-soft text-ink placeholder:text-ink-2/70"
        : "border-rule-2 bg-paper-3 text-ink placeholder:text-muted focus:border-accent focus:ring-accent/25 hover:border-muted"
    }`;

  const labelClasses = "flex items-center gap-1.5 text-xs font-medium mb-2 text-ink-2";

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] flex items-start lg:items-center justify-center p-3 py-4 sm:py-6 pb-24 lg:pb-8 bg-paper transition-colors duration-200">
      <div className="relative max-w-4xl w-full min-w-0">
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="w-9 h-9 rounded-[6px] flex items-center justify-center bg-accent-soft border border-accent/30 text-accent">
            <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-medium text-ink">ส่งเคสปรึกษา</h1>
            <p className="text-xs text-muted">กรอกข้อมูลผู้ป่วยและเลือกแผนกที่ต้องการปรึกษา</p>
          </div>
        </div>

        <div className="p-5 md:p-6 rounded-[10px] relative z-0 border border-rule bg-paper-2 transition-colors">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(false);
            }}
            className="space-y-5"
          >
            <fieldset disabled={isLoading} className="space-y-5">
              {/* Step 1: HN + Name row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="hn" className={labelClasses}>
                    <svg aria-hidden="true" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                    HN <span className="text-bad">*</span>
                  </label>
                  <input
                    ref={hnRef}
                    type="text"
                    id="hn"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={hn}
                    aria-invalid={Boolean(errors.hn)}
                    aria-describedby={errors.hn ? "hn-error" : undefined}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, "");
                      setHn(digitsOnly);
                      if (errors.hn) setErrors((prev) => { const n = { ...prev }; delete n.hn; return n; });
                    }}
                    className={`${inputClasses("hn")} measured`}
                    placeholder="เช่น 1234567"
                    required
                  />
                  {errors.hn && <p id="hn-error" className="text-bad text-xs mt-1 font-medium">{errors.hn}</p>}
                </div>
                <div>
                  <label htmlFor="firstName" className={labelClasses}>
                    <svg aria-hidden="true" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    ชื่อ <span className="text-bad">*</span>
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={firstName}
                    aria-invalid={Boolean(errors.firstName)}
                    aria-describedby={errors.firstName ? "firstName-error" : undefined}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((prev) => { const n = { ...prev }; delete n.firstName; return n; });
                    }}
                    className={inputClasses("firstName")}
                    placeholder="ชื่อผู้ป่วย"
                    required
                  />
                  {errors.firstName && <p id="firstName-error" className="text-bad text-xs mt-1 font-medium">{errors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="lastName" className={labelClasses}>
                    <svg aria-hidden="true" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    นามสกุล <span className="text-bad">*</span>
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={lastName}
                    aria-invalid={Boolean(errors.lastName)}
                    aria-describedby={errors.lastName ? "lastName-error" : undefined}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName) setErrors((prev) => { const n = { ...prev }; delete n.lastName; return n; });
                    }}
                    className={inputClasses("lastName")}
                    placeholder="นามสกุลผู้ป่วย"
                    required
                  />
                  {errors.lastName && <p id="lastName-error" className="text-bad text-xs mt-1 font-medium">{errors.lastName}</p>}
                </div>
              </div>

              {/* Step 2: Room */}
              <div>
                <label htmlFor="room" className={labelClasses}>
                  <svg aria-hidden="true" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  ห้องตรวจ <span className="text-bad">*</span>
                </label>
                <select
                  id="room"
                  value={room}
                  aria-invalid={Boolean(errors.room)}
                  aria-describedby={errors.room ? "room-error" : undefined}
                  onChange={(e) => {
                    setRoom(e.target.value as RoomName | "");
                    if (errors.room) setErrors((prev) => { const n = { ...prev }; delete n.room; return n; });
                  }}
                  className={inputClasses("room")}
                  required
                >
                  <option value="" className="bg-paper-2 text-muted">เลือกห้องตรวจ</option>
                  {ROOMS.map((r) => (
                    <option key={r} value={r} className="bg-paper-2 text-ink">
                      {r}
                    </option>
                  ))}
                </select>
                {errors.room && <p id="room-error" className="text-bad text-xs mt-1 font-medium">{errors.room}</p>}
              </div>

              {/* Step 3: Problem */}
              <div>
                <label htmlFor="problem" className={labelClasses}>
                  <svg aria-hidden="true" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  รายละเอียดปัญหา <span className="text-bad">*</span>
                </label>
                <textarea
                  id="problem"
                  value={problem}
                  aria-invalid={Boolean(errors.problem)}
                  aria-describedby={errors.problem ? "problem-error" : undefined}
                  onChange={(e) => {
                    setProblem(e.target.value);
                    if (errors.problem) setErrors((prev) => { const n = { ...prev }; delete n.problem; return n; });
                  }}
                  className={inputClasses("problem") + " min-h-[96px]"}
                  rows={3}
                  placeholder="เช่น TBI with GCS 9, Blunt abdomen…"
                  required
                />
                {errors.problem && <p id="problem-error" className="text-bad text-xs mt-1 font-medium">{errors.problem}</p>}
              </div>

              {/* Step 4: Departments */}
              <div>
                <label id="departments-label" className={labelClasses}>
                  <svg aria-hidden="true" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  แผนกที่ปรึกษา <span className="text-bad">*</span>
                </label>
                <div
                  id="departments"
                  tabIndex={-1}
                  role="group"
                  aria-labelledby="departments-label"
                  aria-describedby={errors.departments ? "departments-error" : undefined}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                >
                  {ALL_DEPARTMENTS.map((dept) => (
                    <div
                      key={dept}
                      className="relative cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        id={dept}
                        value={dept}
                        checked={selectedDepts.includes(dept)}
                        onChange={() => handleCheckboxChange(dept)}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={dept}
                        className={`flex items-center justify-center gap-1.5 p-2.5 min-h-[42px] rounded-[6px] border cursor-pointer transition-colors duration-200 font-medium text-xs whitespace-nowrap peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                          selectedDepts.includes(dept)
                            ? "bg-ok text-paper border-ok"
                            : "bg-paper-3 text-ink border-rule-2 hover:border-ok/60 hover:bg-paper-2"
                        }`}
                      >
                        {selectedDepts.includes(dept) && (
                          <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {dept}
                      </label>
                    </div>
                  ))}
                </div>
                {errors.departments && (
                  <p id="departments-error" className="text-bad text-xs mt-1 font-medium">
                    {errors.departments}
                  </p>
                )}
                {selectedDepts.length > 0 && (
                  <div className="mt-2 p-2.5 rounded-[6px] border bg-ok-soft border-ok/30">
                    <p className="text-xs font-medium text-ok">
                      เลือกแล้ว {selectedDepts.length} แผนก:{" "}
                      <span className="font-semibold text-ink">{selectedDepts.join(", ")}</span>
                    </p>
                  </div>
                )}
                {duplicatePendingMatches.length > 0 && (
                  <div role="alert" className="mt-2 p-2.5 rounded-[6px] border bg-accent-soft border-accent/40">
                    <p className="text-xs font-medium text-accent">
                      คำเตือน: HN {hn.trim()} มีเคสรอปรึกษาค้างอยู่แล้วในแผนก{" "}
                      <span className="font-semibold text-ink">
                        {duplicatePendingMatches.map((m) => `${m.dept} (${m.room})`).join(", ")}
                      </span>{" "}
                      (กรุณาตรวจสอบก่อนส่งซ้ำ)
                    </p>
                  </div>
                )}
              </div>

              {/* Submit buttons */}
              <div className="pt-4 border-t border-rule">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubmit(false)}
                      disabled={isLoading}
                      className={`w-full font-medium py-3 px-2.5 sm:px-4 rounded-[6px] transition-opacity duration-200 text-sm flex items-center justify-center gap-1.5 sm:gap-2 tap-feedback whitespace-nowrap ${
                        isLoading
                          ? "bg-paper-3 cursor-not-allowed text-muted border border-rule"
                          : "bg-ok text-paper hover:opacity-90"
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full motion-safe:animate-spin motion-reduce:animate-none"></div>
                          <span>กำลังส่ง…</span>
                        </>
                      ) : (
                        <>
                          <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          ส่ง Consult
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-center text-muted">
                      คลิกเพื่อส่งเคสปกติ
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubmit(true)}
                      disabled={isLoading}
                      className={`w-full font-medium py-3 px-2.5 sm:px-4 rounded-[6px] transition-opacity duration-200 text-sm flex items-center justify-center gap-1.5 sm:gap-2 tap-feedback whitespace-nowrap ${
                        isLoading
                          ? "bg-paper-3 cursor-not-allowed text-muted border border-rule"
                          : "bg-bad text-paper hover:opacity-90"
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full motion-safe:animate-spin motion-reduce:animate-none"></div>
                          <span>กำลังส่ง…</span>
                        </>
                      ) : (
                        <>
                          <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Fast Track
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-center text-muted">
                      <kbd className="px-1.5 py-0.5 rounded-[4px] text-[10px] bg-paper-3 border border-rule text-ink-2">{isMac ? "⌘" : "Ctrl"}+Enter</kbd> ส่งด่วน
                    </p>
                  </div>
                </div>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}
