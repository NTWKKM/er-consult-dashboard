"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useConsultActions, PostAcceptStatus } from "./hooks/useConsultActions";
import ConsultCard from "@/app/components/ConsultCard";
import SkeletonLoading from "@/app/components/SkeletonLoading";
import ErrorState from "@/app/components/ErrorState";
import ConfirmModal from "@/app/components/ConfirmModal";
import { RoomTransferButton } from "@/app/components/RoomTransferButton";
import { subscribeToConsultsByStatus, Consult } from "@/lib/db";
import { getMilestones, formatTime } from "@/lib/utils";
import { ElapsedTime as PatientTableElapsedTime } from "@/app/components/ElapsedTime";
import { SURGERY_DEPTS, ORTHO_DEPTS, POST_ACCEPT_STATUSES, ACCEPT_STATUS } from "@/lib/constants";
import { findNewCaseIds } from "@/lib/utils";
import { useSettings } from "./contexts/SettingsContext";
import { buildDepartmentCasesMap, type RoomFilter, matchesRoomFilter } from "@/lib/departmentCasesMap";



export default function Dashboard() {
  const [allCases, setAllCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Persistence logic for filters and view modes
  const [view, setView] = useState<"both" | "surgery" | "ortho">("both");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");

  const settingsLoadedRef = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedView = localStorage.getItem("dashboard_view");
      const savedRoomFilter = localStorage.getItem("dashboard_roomFilter");
      
      if (savedView === "both" || savedView === "surgery" || savedView === "ortho") {
        setView(savedView);
      }
      if (savedRoomFilter === "all" || savedRoomFilter === "resus" || savedRoomFilter === "non-resus") {
        setRoomFilter(savedRoomFilter as RoomFilter);
      }
    } catch (e) {
      console.warn("Failed to load settings from localStorage:", e);
    } finally {
      settingsLoadedRef.current = true;
    }
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    try {
      localStorage.setItem("dashboard_view", view);
      localStorage.setItem("dashboard_roomFilter", roomFilter);
    } catch (e) {
      console.warn("Failed to save settings to localStorage:", e);
    }
  }, [view, roomFilter]);

  const { darkMode, soundEnabled, displayMode } = useSettings();

  const previousCaseIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const deptRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const audioContextRef = useRef<AudioContext | null>(null);

  const scrollToDepartment = (deptName: string) => {
    deptRefs.current[deptName]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const initAudioContext = useCallback(() => {
    if (typeof window !== "undefined") {
      if (!audioContextRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      initAudioContext();
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };

    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, [initAudioContext]);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;

    if (!audioContextRef.current) {
      initAudioContext();
    }
    if (!audioContextRef.current) return;

    const audioContext = audioContextRef.current;

    const playBeep = (startTime: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.8, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.5);
    };

    const now = audioContext.currentTime;
    playBeep(now);
    playBeep(now + 0.6);
    playBeep(now + 1.2);
  }, [soundEnabled, initAudioContext]);

  useEffect(() => {
    const currentIds = new Set(allCases.map((c) => c.id));
    if (!isInitialLoadRef.current) {
      const newIds = findNewCaseIds(currentIds, previousCaseIdsRef.current);
      if (newIds.length > 0) {
        playNotificationSound();
      }
    }
    previousCaseIdsRef.current = currentIds;
    isInitialLoadRef.current = false;
  }, [allCases, playNotificationSound]);

  useEffect(() => {
    const unsubscribe = subscribeToConsultsByStatus(
      "pending",
      (data) => {
        setAllCases(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Subscription error:", err);
        setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const filteredAllCases = useMemo(() => {
    return allCases.filter((caseData) => matchesRoomFilter(caseData, roomFilter));
  }, [allCases, roomFilter]);

  const visibleTableCases = useMemo(
    () =>
      filteredAllCases.filter((caseData) =>
        Object.values(caseData.departments).some((dept) => dept.status === "pending")
      ),
    [filteredAllCases]
  );

  const departmentCasesMap = useMemo(() => {
    return buildDepartmentCasesMap(filteredAllCases, "all");
  }, [filteredAllCases]);

  const getCasesForDepartment = (deptName: string) => {
    return departmentCasesMap[deptName] || [];
  };

  const totalPendingCases = visibleTableCases.length;

  if (loading) {
    return <SkeletonLoading darkMode={darkMode} />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-gray-900" : ""}`}>
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5">
        {/* --- Toolbar --- */}
        <div className={`mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl shadow-sm border transition-colors slide-in ${
          darkMode ? "bg-gray-800/80 border-gray-700" : "bg-white/90 border-[#C7CFDA]/60"
        }`}>
          {/* Left: Pending Count */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start px-2">
            <div className={`flex items-center gap-2 font-bold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
              <svg className="w-5 h-5 text-[#E55143]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>รอปรึกษา:</span>
            </div>
            <span className={`text-xl font-bold px-3 py-0.5 rounded-full shadow-inner ${
                totalPendingCases > 0 
                  ? "bg-[#E55143]/10 text-[#E55143] dark:bg-[#E55143]/20" 
                  : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400"
              }`}>
              {totalPendingCases}
            </span>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">


             {/* Room Filter */}
             <div className={`flex items-center p-1 rounded-lg border ${darkMode ? "bg-gray-900 border-gray-700" : "bg-gray-100 border-gray-200"}`}>
               <button aria-pressed={roomFilter === "all"} onClick={() => setRoomFilter("all")} className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${roomFilter === "all" ? "bg-white dark:bg-gray-700 text-[#014167] dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>All</button>
               <button aria-pressed={roomFilter === "resus"} onClick={() => setRoomFilter("resus")} className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${roomFilter === "resus" ? "bg-[#E55143] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>Resus</button>
               <button aria-pressed={roomFilter === "non-resus"} onClick={() => setRoomFilter("non-resus")} className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${roomFilter === "non-resus" ? "bg-[#699D5D] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>Non-Resus</button>
             </div>

             {/* View Filter (Card View Only) */}
             {displayMode === "card" && (
                <div className={`flex items-center p-1 rounded-lg border ${darkMode ? "bg-gray-900 border-gray-700" : "bg-gray-100 border-gray-200"}`}>
                   <button aria-pressed={view === "both"} onClick={() => setView("both")} className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${view === "both" ? "bg-white dark:bg-gray-700 text-[#014167] dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>Both</button>
                   <button aria-pressed={view === "surgery"} onClick={() => setView("surgery")} className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${view === "surgery" ? "bg-[#E55143] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>Surgery</button>
                   <button aria-pressed={view === "ortho"} onClick={() => setView("ortho")} className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${view === "ortho" ? "bg-[#699D5D] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"}`}>Ortho</button>
                </div>
             )}
          </div>
        </div>

        {displayMode === "card" && (
          <details
            className={`mb-4 rounded-xl shadow-sm border overflow-hidden transition-colors ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-white/90 border-[#C7CFDA]/60"
            }`}
          >
            <summary
              className={`cursor-pointer px-4 py-3 font-bold transition-all flex items-center justify-between select-none ${
                darkMode ? "text-gray-200 hover:bg-gray-700/50" : "text-[#014167] hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Quick Navigation
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className={`p-3 border-t ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
              {/* Horizontal Scroll Area for mobile, grid for larger screens */}
              <div className="flex overflow-x-auto lg:grid lg:grid-cols-9 gap-2 pb-2 hide-scrollbar">
                {(
                  view === "surgery"
                    ? SURGERY_DEPTS
                    : view === "ortho"
                      ? ORTHO_DEPTS
                      : [...SURGERY_DEPTS, ...ORTHO_DEPTS]
                ).map((dept) => {
                  const cases = getCasesForDepartment(dept);
                  const isSurgery = (SURGERY_DEPTS as readonly string[]).includes(dept);
                  return (
                    <button
                      key={dept}
                      onClick={() => scrollToDepartment(dept)}
                      className={`flex-shrink-0 w-24 lg:w-auto rounded-lg px-2 py-2 transition-all duration-200 shadow-sm hover:shadow-md group flex flex-col items-center justify-center border ${
                        darkMode
                          ? `bg-gray-800 text-gray-200 ${
                              isSurgery
                                ? "border-[#ff7063]/30 hover:bg-[#E55143] hover:text-white"
                                : "border-[#8bc34a]/30 hover:bg-[#699D5D] hover:text-white"
                            }`
                          : `bg-white text-[#014167] ${
                              isSurgery
                                ? "border-[#E55143]/20 hover:bg-[#E55143] hover:text-white"
                                : "border-[#699D5D]/20 hover:bg-[#699D5D] hover:text-white"
                            }`
                      }`}
                    >
                      <div className="text-[11px] font-bold mb-1 w-full truncate text-center" title={dept}>{dept}</div>
                      <div
                        className={`text-lg font-bold leading-none ${
                          cases.length > 0
                            ? "text-[#E55143] group-hover:text-white"
                            : darkMode ? "text-gray-500 group-hover:text-white" : "text-gray-400 group-hover:text-white"
                        }`}
                      >
                        {cases.length}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        )}

        {/* ------------------------------------------------------------------------ */}
        {/* RENDER LOGIC: TABLE VIEW OR CARD VIEW */}
        {/* ------------------------------------------------------------------------ */}

        {displayMode === "table" ? (
          <>
            {/* Desktop Table View */}
            <div className={`hidden md:block rounded-xl shadow-lg border overflow-hidden transition-all duration-300 slide-in ${darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-[#C7CFDA]"}`}>
              <div className="overflow-x-auto relative w-full">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className={`text-sm ${darkMode ? "bg-gray-800 text-gray-200 border-b border-gray-700" : "bg-[#014167] text-white"}`}>
                    <tr>
                      <th className="p-3 w-[20%] font-bold">PATIENT</th>
                      <th className="p-3 w-[10%] font-bold">ROOM</th>
                      <th className="p-3 w-[40%] font-bold">DX</th>
                      <th className="p-3 w-[30%] font-bold">MANAGEMENT</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? "divide-gray-800 bg-gray-900" : "divide-[#014167]/10 bg-[#f9fafc]"}`}>
                    {visibleTableCases.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={`p-8 text-center font-bold ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>
                          ไม่มีเคสรอปรึกษา
                        </td>
                      </tr>
                    ) : (
                      visibleTableCases.map((caseData) => (
                        <PatientTableRow key={caseData.id} caseData={caseData} darkMode={darkMode} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Stacked Card Layout */}
            <div className="md:hidden flex flex-col gap-3 slide-in">
              {visibleTableCases.length === 0 ? (
                <div className={`text-center py-8 rounded-xl border font-bold ${darkMode ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-white border-[#C7CFDA] text-[#014167]"}`}>
                  ไม่มีเคสรอปรึกษา
                </div>
              ) : (
                visibleTableCases.map((caseData) => (
                  <MobilePatientCard key={caseData.id} caseData={caseData} darkMode={darkMode} />
                ))
              )}
            </div>
          </>
        ) : (
          /* ORIGINAL CARD VIEW */
          <div className="flex flex-col lg:flex-row gap-4">
            {(view === "surgery" || view === "both") && (
              <div
                className={`${
                  view === "both" ? "lg:flex-[3]" : "flex-1"
                } rounded-xl shadow-lg border border-[#E55143]/30 overflow-hidden transition-all duration-300 hover:shadow-2xl slide-in ${
                  darkMode ? "bg-gray-900" : "bg-[#b0bac7]"
                }`}
              >
                <div className="bg-[#E55143] text-white px-5 py-3 border-b border-[#E55143]/20">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    Surgery
                    <span className="text-white/80 text-sm font-normal ml-1 hidden sm:inline">แผนกศัลยกรรม</span>
                  </h2>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {SURGERY_DEPTS.map((dept) => {
                    const cases = getCasesForDepartment(dept);
                    const isSurgery = true; // Inside surgery map block
                    return (
                      <div
                        key={dept}
                        className="flex flex-col gap-2"
                        ref={(el) => {
                          deptRefs.current[dept] = el;
                        }}
                      >
                        <div
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                            darkMode
                              ? isSurgery ? "bg-[#E55143]/10 border-[#ff7063]/50" : "bg-[#699D5D]/10 border-[#8bc34a]/50"
                              : "bg-[#012a47] border-[#E55143]/20"
                          }`}
                        >
                          <h3 className="text-sm font-bold text-[#FDFCDF]">{dept}</h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              cases.length > 0
                                ? "bg-[#E55143]/20 text-[#E55143]"
                                : "bg-[#699D5D]/20 text-[#699D5D]"
                            }`}
                          >
                            {cases.length}
                          </span>
                        </div>
                        {cases.length === 0 ? (
                          <div
                            className={`text-center py-2 px-3 rounded-lg border ${
                              darkMode
                                ? "bg-emerald-500/10 border-emerald-500/20"
                                : "bg-[#699D5D]/10 border-[#699D5D]/30"
                            }`}
                          >
                            <p className={`font-medium text-sm ${darkMode ? "text-emerald-400" : "text-[#4d7845]"}`}>
                              ✓ ไม่มีเคสค้าง
                            </p>
                          </div>
                        ) : (
                          cases.map((caseData, index) => (
                            <ConsultCard
                              key={caseData.id}
                              caseData={caseData}
                              caseId={caseData.id}
                              departmentName={dept}
                              darkMode={darkMode}
                              animationDelay={index * 50}
                            />
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(view === "ortho" || view === "both") && (
              <div
                className={`${
                  view === "both" ? "lg:flex-[1]" : "flex-1"
                } rounded-xl shadow-lg border border-[#699D5D]/30 overflow-hidden transition-all duration-300 hover:shadow-2xl slide-in ${
                  darkMode ? "bg-gray-900" : "bg-[#b0bac7]"
                }`}
              >
                <div className="bg-[#699D5D] text-[#FDFCDF] px-5 py-3 border-b border-[#699D5D]/20">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
                    </svg>
                    Ortho
                    <span className="text-[#C7CFDA] text-sm font-normal ml-1 hidden sm:inline">ศัลยกรรมกระดูก</span>
                  </h2>
                </div>
                <div className="p-4">
                  {ORTHO_DEPTS.map((dept) => {
                    const cases = getCasesForDepartment(dept);
                    const isSurgery = false; // Inside ortho map block
                    return (
                      <div
                        key={dept}
                        className="flex flex-col gap-2 max-w-full"
                        ref={(el) => {
                          deptRefs.current[dept] = el;
                        }}
                      >
                        <div
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                            darkMode
                              ? isSurgery ? "bg-[#E55143]/10 border-[#ff7063]/50" : "bg-[#699D5D]/10 border-[#8bc34a]/50"
                              : "bg-[#014a3d] border-[#699D5D]/20"
                          }`}
                        >
                          <h3 className="text-sm font-bold text-[#FDFCDF]">{dept}</h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              cases.length > 0
                                ? "bg-[#E55143]/20 text-[#E55143]"
                                : "bg-[#699D5D]/20 text-[#699D5D]"
                            }`}
                          >
                            {cases.length}
                          </span>
                        </div>
                        {cases.length === 0 ? (
                          <div
                            className={`text-center py-2 px-3 rounded-lg border ${
                              darkMode
                                ? "bg-emerald-500/10 border-emerald-500/20"
                                : "bg-[#699D5D]/10 border-[#699D5D]/30"
                            }`}
                          >
                            <p className={`font-medium text-sm ${darkMode ? "text-emerald-400" : "text-[#4d7845]"}`}>
                              ✓ ไม่มีเคสค้าง
                            </p>
                          </div>
                        ) : (
                          <div
                            className={
                              view === "ortho"
                                ? "grid grid-cols-1 md:grid-cols-2 gap-2"
                                : "flex flex-col gap-2"
                            }
                          >
                            {cases.map((caseData, index) => (
                              <ConsultCard
                                key={caseData.id}
                                caseData={caseData}
                                caseId={caseData.id}
                                departmentName={dept}
                                darkMode={darkMode}
                                animationDelay={index * 50}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// SUB-COMPONENTS FOR TABLE VIEW
// ===========================================================================

function MobilePatientCard({ caseData, darkMode }: { caseData: Consult; darkMode: boolean }) {
  const pendingDepts = Object.keys(caseData.departments).filter(
    (d) => caseData.departments[d].status === "pending"
  );
  if (pendingDepts.length === 0) return null;

  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");
  const sentTimeFull = caseData.createdAt
    ? formatTime(caseData.createdAt)
    : "";

  return (
    <div className={`p-4 rounded-xl border ${darkMode ? "bg-gray-800/80 border-gray-700" : "bg-white border-[#C7CFDA] shadow-sm"} flex flex-col gap-3`}>
      {/* Header: HN & Fast Track */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-lg font-bold tabular-nums ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>{caseData.hn}</span>
            {caseData.isUrgent && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#E55143] text-white shadow-sm">FAST</span>
            )}
          </div>
          {fullName && (
            <div className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]/80"}`}>
              {fullName}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className={`px-2 py-1 rounded-md text-xs font-semibold ${darkMode ? "bg-gray-700 text-gray-200" : "bg-[#C7CFDA] text-[#014167]"}`}>
              {caseData.room}
            </span>
            <RoomTransferButton 
              consultId={caseData.id}
              currentRoom={caseData.room}
              darkMode={darkMode}
            />
          </div>
        </div>
      </div>

      {/* DX Section */}
      <div className={`text-sm p-3 rounded-md ${darkMode ? "bg-gray-900/50 text-gray-300" : "bg-gray-50 text-[#014167]"}`}>
        <div className={`text-xs font-semibold mb-1 opacity-70`}>Dx / Problem</div>
        <div className="whitespace-pre-wrap">{caseData.problem}</div>
      </div>

      {/* Time Info */}
      <div className={`flex justify-between items-center text-[10px] font-medium ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>
        <div className="flex items-center gap-1">
           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           {sentTimeFull}
        </div>
        <PatientTableElapsedTime createdAt={caseData.createdAt || ""} />
      </div>

      {/* Management Actions */}
      <div className="flex flex-col gap-2 mt-1">
        {pendingDepts.map(dept => (
          <DepartmentActionPanel key={dept} caseData={caseData} deptName={dept} darkMode={darkMode} />
        ))}
      </div>
    </div>
  );
}

function PatientTableRow({ caseData, darkMode }: { caseData: Consult; darkMode: boolean }) {
  // กรองเฉพาะแผนกที่สถานะยังรออยู่ (pending) ของเคสนี้
  const pendingDepts = Object.keys(caseData.departments).filter(
    (d) => caseData.departments[d].status === "pending"
  );

  if (pendingDepts.length === 0) return null;

  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");
  const sentTimeFull = caseData.createdAt
    ? formatTime(caseData.createdAt)
    : "";

  return (
    <tr className={`transition-colors align-top ${darkMode ? "hover:bg-gray-800/50" : "hover:bg-[#014167]/5"}`}>
      <td className={`p-3 align-top ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold">{caseData.hn}</span>
          {caseData.isUrgent && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#E55143] text-white shadow-sm">FAST</span>
          )}
        </div>
        {fullName && (
          <div className={`text-sm font-medium mb-2 ${darkMode ? "text-gray-300" : "text-[#014167]/80"}`}>
            {fullName}
          </div>
        )}
        <div className={`text-[10px] font-medium flex flex-col gap-1 ${darkMode ? "text-gray-500" : "text-[#014167]/60"}`}>
          <div className="flex items-center gap-1">
             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             {sentTimeFull}
          </div>
          <PatientTableElapsedTime createdAt={caseData.createdAt || ""} />
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${darkMode ? "bg-gray-700 text-gray-200" : "bg-[#C7CFDA] text-[#014167]"}`}>
            {caseData.room}
          </span>
          <RoomTransferButton 
            consultId={caseData.id}
            currentRoom={caseData.room}
            darkMode={darkMode}
          />
        </div>
      </td>
      <td className={`p-3 text-sm whitespace-pre-wrap ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
        {caseData.problem}
      </td>
      <td className="p-3">
        <div className="flex flex-col gap-2">
          {pendingDepts.map(dept => (
            <DepartmentActionPanel key={dept} caseData={caseData} deptName={dept} darkMode={darkMode} />
          ))}
        </div>
      </td>
    </tr>
  );
}

function DepartmentActionPanel({ caseData, deptName, darkMode }: { caseData: Consult; deptName: string; darkMode: boolean }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const dept = caseData.departments[deptName];
  const isAccepted = !!dept?.acceptedAt;
  const actionStatus = dept?.actionStatus || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;
  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");

  const milestones = getMilestones(dept, formatTime);

  const {
    isUpdating,
    handleAccept,
    handleStatusChange,
    handleComplete,
    handleCancel,
  } = useConsultActions(caseData.id, deptName, caseData.hn);

  const onAccept = async () => {
    await handleAccept();
  };

  const onStatusChange = async (newStatus: PostAcceptStatus) => {
    await handleStatusChange(newStatus);
  };

  const onComplete = async () => {
    setShowConfirm(false);
    await handleComplete();
  };

  const onCancel = async () => {
    setShowCancelConfirm(false);
    await handleCancel();
  };

  return (
    <>
      <div className={`p-1.5 rounded-lg border flex flex-row items-start gap-2 transition-all ${darkMode ? "bg-gray-800 border-gray-700 shadow-sm" : "bg-white border-[#C7CFDA]/50 shadow-sm"}`}>
        <span className={`font-bold text-xs min-w-[65px] truncate mt-1.5 ${darkMode ? "text-gray-300" : "text-[#014167]"}`} title={deptName}>
          {deptName}
        </span>
        
        <div className="flex-1 flex flex-col gap-1.5 w-full">
          <div className="flex gap-2 items-stretch h-8">
            {!isAccepted ? (
              <>
                <button
                  onClick={onAccept}
                  disabled={isUpdating}
                  className={`flex-1 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm ${
                    isUpdating
                      ? "bg-gray-400 text-white cursor-not-allowed"
                      : "bg-[#699D5D] text-white hover:bg-[#5a8a4f] hover:shadow-md transform hover:-translate-y-0.5"
                  }`}
                >
                  {isUpdating ? "..." : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      รับเคส
                    </>
                  )}
                </button>
                <button disabled className={`flex-1 rounded-md text-xs font-bold flex items-center justify-center gap-1 cursor-not-allowed ${
                  darkMode ? "bg-gray-800 border border-dashed border-gray-600 text-gray-500" : "bg-gray-50 border border-dashed border-gray-300 text-gray-400"
                }`}>
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  ปิดเคส
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 relative">
                  <select
                    value={actionStatus && actionStatus !== ACCEPT_STATUS ? actionStatus : ""}
                    onChange={(e) => onStatusChange(e.target.value as PostAcceptStatus)}
                    disabled={isUpdating}
                    className={`w-full h-full rounded-md text-xs font-bold border appearance-none cursor-pointer pl-2 pr-6 focus:outline-none focus:ring-2 focus:ring-amber-500/50 shadow-sm transition-colors ${
                      actionStatus && actionStatus !== ACCEPT_STATUS
                        ? (darkMode ? "bg-amber-500/20 text-amber-300 border-amber-500" : "bg-amber-50 text-amber-700 border-amber-400")
                        : (darkMode ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-white text-[#014167] border-[#C7CFDA]")
                    }`}
                  >
                    <option value="" disabled>สถานะ</option>
                    {POST_ACCEPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                    <svg className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={isUpdating || !isStatusSelected}
                  className={`flex-1 rounded-md text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-sm ${
                    isUpdating || !isStatusSelected
                      ? darkMode
                        ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-dashed border-gray-600"
                        : "bg-gray-50 text-gray-400 cursor-not-allowed border border-dashed border-gray-300"
                      : "bg-[#E55143] text-white hover:bg-[#d44639] hover:shadow-md transform hover:-translate-y-0.5"
                  }`}
                >
                  {isUpdating ? "..." : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      ปิดเคส
                    </>
                  )}
                </button>
              </>
            )}

            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={isUpdating}
              className={`w-7 h-8 flex items-center justify-center rounded-md transition-colors border shadow-sm ${
                darkMode 
                  ? "bg-gray-800 border-gray-700 text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30" 
                  : "bg-white border-[#C7CFDA]/50 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200"
              }`}
              title="ยกเลิก"
              aria-label="ยกเลิกการปรึกษา"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

            {milestones.length > 0 && (
              <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 ${darkMode ? "text-gray-400" : "text-[#014167]/70"}`}>
                {milestones.map((m, idx, arr) => (
                  <React.Fragment key={`${m.label}-${m.raw}`}>
                    <div className="flex items-center gap-1 text-[10px]">
                      {m.icon === "check" ? (
                        <svg className="w-2.5 h-2.5 text-[#699D5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : m.icon === "transfer" ? (
                        <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      ) : null}
                      <span className={`font-semibold whitespace-nowrap ${darkMode ? m.colorDark : m.colorLight}`}>{m.label} {m.time}</span>
                    </div>
                    {idx < arr.length - 1 && (
                      <span className={darkMode ? "text-gray-700" : "text-[#014167]/20"}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="ปิดเคส"
        message={`คุณแน่ใจหรือไม่ที่จะปิดเคส HN: ${caseData.hn}${fullName ? ` (${fullName})` : ""} แผนก: ${deptName}?`}
        confirmText="ยืนยันปิดเคส"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={onComplete}
        onCancel={() => setShowConfirm(false)}
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        title="ยกเลิกปรึกษา"
        message={`คุณต้องการยกเลิกการปรึกษา HN: ${caseData.hn}${fullName ? ` (${fullName})` : ""} แผนก: ${deptName}?`}
        confirmText="ยืนยันยกเลิก"
        cancelText="ไม่ยกเลิก"
        variant="warning"
        onConfirm={onCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </>
  );
}
