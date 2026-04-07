"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ConsultCard from "@/app/components/ConsultCard";
import SkeletonLoading from "@/app/components/SkeletonLoading";
import ErrorState from "@/app/components/ErrorState";
import ConfirmModal from "@/app/components/ConfirmModal";
import { subscribeToConsultsByStatus, Consult, updateConsult, ConsultDepartment } from "@/lib/db";
import { SURGERY_DEPTS, ORTHO_DEPTS, POST_ACCEPT_STATUSES, ACCEPT_STATUS } from "@/lib/constants";
import { findNewCaseIds } from "@/lib/utils";
import { useSettings } from "./contexts/SettingsContext";
import { useToast } from "./contexts/ToastContext";
import { buildDepartmentCasesMap, type RoomFilter, matchesRoomFilter } from "@/lib/departmentCasesMap";

// Helper for formatting status times
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" });

const PatientTableElapsedTime = React.memo(function PatientTableElapsedTime({ createdAt, darkMode }: { createdAt: string; darkMode: boolean }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(createdAt).getTime();
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;

      if (hrs > 0) {
        setElapsed(`${hrs} ชม. ${remainMins} นาที`);
      } else {
        setElapsed(`${remainMins} นาที`);
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold elapsed-tick ${
        darkMode ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/15 text-amber-700"
      }`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      รอ {elapsed}
    </span>
  );
});

export default function Dashboard() {
  const [allCases, setAllCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"both" | "surgery" | "ortho">("both");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  
  // NEW: State สำหรับจัดการรูปแบบการแสดงผล (Card หรือ Table)
  const [displayMode, setDisplayMode] = useState<"card" | "table">("card");

  const { darkMode, soundEnabled } = useSettings();

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

  const departmentCasesMap = useMemo(() => {
    return buildDepartmentCasesMap(filteredAllCases, "all");
  }, [filteredAllCases]);

  const getCasesForDepartment = (deptName: string) => {
    return departmentCasesMap[deptName] || [];
  };

  const totalPendingCases = filteredAllCases.length;

  if (loading) {
    return <SkeletonLoading darkMode={darkMode} />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-gray-900" : ""}`}>
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5">
        <div className="mb-4 text-center slide-in">
          <div className="flex flex-row flex-wrap items-center justify-center gap-2">
            <div
              className={`inline-flex items-center gap-3 px-6 py-2 rounded-full shadow-lg border transition-colors ${
                darkMode ? "bg-gray-700 border-gray-600" : "bg-[#C7CFDA] border-[#014167]/30"
              }`}
            >
              <span className={`font-bold ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
                เคสรอปรึกษา:
              </span>
              <span
                className={`text-2xl font-bold ${
                  totalPendingCases > 0
                    ? "text-[#E55143]"
                    : darkMode
                    ? "text-gray-300"
                    : "text-[#014167]"
                }`}
              >
                {totalPendingCases}
              </span>
            </div>

            {/* Layout Toggle: Card vs Table */}
            <div
              className={`flex items-center p-1 rounded-lg shadow-md border ${
                darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#014167]/30"
              }`}
            >
              <button
                className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs flex items-center gap-1 glow-hover ${
                  displayMode === "card"
                    ? "bg-[#014167] text-white shadow-sm"
                    : darkMode
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-[#014167] hover:bg-white/50"
                }`}
                onClick={() => setDisplayMode("card")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Card View
              </button>
              <button
                className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs flex items-center gap-1 glow-hover ${
                  displayMode === "table"
                    ? "bg-[#699D5D] text-white shadow-sm"
                    : darkMode
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-[#014167] hover:bg-white/50"
                }`}
                onClick={() => setDisplayMode("table")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Table View
              </button>
            </div>

            <div
              className={`flex items-center p-1 rounded-lg shadow-md border ${
                darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#014167]/30"
              }`}
            >
              <button
                className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs glow-hover ${
                  roomFilter === "resus"
                    ? "bg-[#E55143] text-white"
                    : darkMode
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-[#014167] hover:bg-white/50"
                }`}
                onClick={() => setRoomFilter("resus")}
              >
                Resus
              </button>
              <button
                className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs glow-hover ${
                  roomFilter === "non-resus"
                    ? "bg-[#699D5D] text-white"
                    : darkMode
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-[#014167] hover:bg-white/50"
                }`}
                onClick={() => setRoomFilter("non-resus")}
              >
                Non-Resus
              </button>
              <button
                className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs glow-hover ${
                  roomFilter === "all"
                    ? "bg-[#014167] text-white"
                    : darkMode
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-[#014167] hover:bg-white/50"
                }`}
                onClick={() => setRoomFilter("all")}
              >
                All
              </button>
            </div>

            {displayMode === "card" && (
              <div
                className={`flex items-center p-1 rounded-lg shadow-md border ${
                  darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#014167]/30"
                }`}
              >
                <button
                  className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs glow-hover ${
                    view === "surgery"
                      ? "bg-[#E55143] text-white"
                      : darkMode
                      ? "text-gray-300 hover:bg-gray-700"
                      : "text-[#E55143] hover:bg-white/50"
                  }`}
                  onClick={() => setView("surgery")}
                >
                  Surgery
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs glow-hover ${
                    view === "ortho"
                      ? "bg-[#699D5D] text-[#FDFCDF]"
                      : darkMode
                      ? "text-gray-300 hover:bg-gray-700"
                      : "text-[#699D5D] hover:bg-white/50"
                  }`}
                  onClick={() => setView("ortho")}
                >
                  Ortho
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md font-bold transition-all duration-200 text-xs glow-hover ${
                    view === "both"
                      ? "bg-[#F1AE9E] text-[#014167]"
                      : darkMode
                      ? "text-gray-300 hover:bg-gray-700"
                      : "text-[#014167] hover:bg-white/50"
                  }`}
                  onClick={() => setView("both")}
                >
                  Both
                </button>
              </div>
            )}
          </div>
        </div>

        {displayMode === "card" && (
          <details
            className={`mb-4 rounded-xl shadow-md border overflow-hidden transition-colors ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-[#C7CFDA] border-[#014167]/20"
            }`}
          >
            <summary
              className={`cursor-pointer px-4 py-3 font-bold transition-all flex items-center justify-between ${
                darkMode ? "text-gray-200 hover:bg-gray-700" : "text-[#014167] hover:bg-[#014167]/10"
              }`}
            >
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
            <div className={`p-4 border-t ${darkMode ? "border-gray-700" : "border-[#014167]/10"}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {[...SURGERY_DEPTS, ...ORTHO_DEPTS].map((dept) => {
                  const cases = getCasesForDepartment(dept);
                  const isSurgery = (SURGERY_DEPTS as readonly string[]).includes(dept);
                  return (
                    <button
                      key={dept}
                      onClick={() => scrollToDepartment(dept)}
                      className={`rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 transition-all duration-200 shadow-sm hover:shadow-md group ${
                        darkMode
                          ? `bg-gray-700 hover:text-white text-gray-200 ${
                              isSurgery
                                ? "border border-[#E55143]/30 hover:bg-[#E55143]"
                                : "border border-[#699D5D]/30 hover:bg-[#699D5D]"
                            }`
                          : `bg-white hover:text-white text-[#014167] ${
                              isSurgery
                                ? "border border-[#E55143]/30 hover:bg-[#E55143]"
                                : "border border-[#699D5D]/30 hover:bg-[#699D5D]"
                            }`
                      }`}
                    >
                      <div className="text-xs font-bold mb-1">{dept}</div>
                      <div
                        className={`text-lg font-bold ${
                          cases.length > 0
                            ? "text-[#E55143] group-hover:text-white"
                            : "text-[#699D5D] group-hover:text-white"
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
          <div className={`rounded-xl shadow-lg border overflow-hidden transition-all duration-300 slide-in ${darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-[#C7CFDA]"}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className={`text-sm ${darkMode ? "bg-gray-800 text-gray-200 border-b border-gray-700" : "bg-[#014167] text-white"}`}>
                  <tr>
                    <th className="p-3 w-[15%] font-bold">HN</th>
                    <th className="p-3 w-[15%] font-bold">NAME</th>
                    <th className="p-3 w-[10%] font-bold">DEPARTMENT</th>
                    <th className="p-3 w-[25%] font-bold">DX</th>
                    <th className="p-3 w-[35%] font-bold">MANAGEMENT</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? "divide-gray-800 bg-gray-900" : "divide-[#014167]/10 bg-[#f9fafc]"}`}>
                  {filteredAllCases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={`p-8 text-center font-bold ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>
                        ไม่มีเคสรอปรึกษา
                      </td>
                    </tr>
                  ) : (
                    filteredAllCases.map((caseData) => (
                      <PatientTableRow key={caseData.id} caseData={caseData} darkMode={darkMode} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
                    <span className="text-white/80 text-sm font-normal ml-1">แผนกศัลยกรรม</span>
                  </h2>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {SURGERY_DEPTS.map((dept) => {
                    const cases = getCasesForDepartment(dept);
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
                              ? "bg-[#E55143]/10 border-[#E55143]/20"
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
                            className={`text-center py-4 px-3 rounded-lg border flex flex-col items-center justify-center ${
                              darkMode
                                ? "bg-gray-800/80 border-gray-700 shadow-inner"
                                : "bg-[#FDFCDF]/90 border-[#014167]/20 shadow-inner"
                            }`}
                          >
                            <svg
                              className={`w-10 h-10 mx-auto mb-2 opacity-80 ${
                                darkMode ? "text-gray-400" : "text-[#014167]"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className={`font-medium text-xs ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                              ไม่มีเคสค้าง
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
                    <span className="text-[#C7CFDA] text-sm font-normal ml-1">ศัลยกรรมกระดูก</span>
                  </h2>
                </div>
                <div className="p-4">
                  {ORTHO_DEPTS.map((dept) => {
                    const cases = getCasesForDepartment(dept);
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
                              ? "bg-[#699D5D]/10 border-[#699D5D]/20"
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
                            className={`text-center py-4 px-3 rounded-lg border flex flex-col items-center justify-center ${
                              darkMode
                                ? "bg-gray-800/80 border-gray-700 shadow-inner"
                                : "bg-[#FDFCDF]/90 border-[#014167]/20 shadow-inner"
                            }`}
                          >
                            <svg
                              className={`w-10 h-10 mx-auto mb-2 opacity-80 ${
                                darkMode ? "text-gray-400" : "text-[#014167]"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className={`font-medium text-xs ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                              ไม่มีเคสค้าง
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

function PatientTableRow({ caseData, darkMode }: { caseData: Consult; darkMode: boolean }) {
  // กรองเฉพาะแผนกที่สถานะยังรออยู่ (pending) ของเคสนี้
  const pendingDepts = Object.keys(caseData.departments).filter(
    (d) => caseData.departments[d].status === "pending"
  );

  if (pendingDepts.length === 0) return null;

  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");
  const sentTimeFull = caseData.createdAt
    ? new Date(caseData.createdAt).toLocaleString("th-TH")
    : "";

  return (
    <tr className={`transition-colors align-top border-l-4 ${caseData.isUrgent ? "border-[#E55143] ring-2 ring-[#E55143]/30" : "border-transparent"} ${darkMode ? "hover:bg-gray-800/50" : "hover:bg-[#014167]/5"}`}>
      <td className={`p-3 font-bold ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>
        <div className="flex items-center gap-2">
          {caseData.hn}
          {caseData.isUrgent && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#E55143] text-white shadow-sm">FAST</span>
          )}
        </div>
        <div className={`text-[10px] mt-1 font-medium flex flex-col gap-1 ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>
          <div className="flex items-center gap-1">
             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             {sentTimeFull}
          </div>
          <PatientTableElapsedTime createdAt={caseData.createdAt || ""} darkMode={darkMode} />
        </div>
      </td>
      <td className={`p-3 text-sm font-medium ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>{fullName || "-"}</td>
      <td className="p-3">
        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${darkMode ? "bg-gray-700 text-gray-200" : "bg-[#C7CFDA] text-[#014167]"}`}>
          {caseData.room}
        </span>
      </td>
      <td className={`p-3 text-sm whitespace-pre-wrap ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>{caseData.problem}</td>
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { addToast } = useToast();

  const dept = caseData.departments[deptName];
  const isAccepted = !!dept?.acceptedAt;
  const actionStatus = dept?.actionStatus || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;
  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");

  const acceptedTime = dept?.acceptedAt ? formatTime(dept.acceptedAt) : null;
  const admittedTime = dept?.admittedAt ? formatTime(dept.admittedAt) : null;
  const returnedTime = dept?.returnedAt ? formatTime(dept.returnedAt) : null;
  const dischargedTime = dept?.dischargedAt ? formatTime(dept.dischargedAt) : null;

  const handleAccept = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await updateConsult(caseData.id, (current) => {
        if (!current.departments || !current.departments[deptName] || current.departments[deptName].status !== "pending") return null;
        const updated = { ...current.departments };
        const targetDepts = (SURGERY_DEPTS as readonly string[]).includes(deptName) ? SURGERY_DEPTS : ORTHO_DEPTS;
        const now = new Date().toISOString();
        
        Object.keys(updated).forEach((d) => {
          if ((targetDepts as readonly string[]).includes(d) && updated[d].status === "pending") {
            updated[d] = { ...updated[d], acceptedAt: updated[d].acceptedAt || now, actionStatus: ACCEPT_STATUS };
          }
        });
        return { departments: updated };
      }, { awaitRemote: false, onBackgroundError: () => addToast({ type: "error", message: "ระบบอัปเดตไม่สำเร็จ ข้อมูลกำลังรีเฟรช" }) });
      
      addToast({ type: "success", message: `รับเคส HN: ${caseData.hn} สำเร็จ` });
    } catch (err) {
      console.error(err);
      addToast({ type: "error", message: "เกิดข้อผิดพลาด" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await updateConsult(caseData.id, (current) => {
        if (!current.departments || !current.departments[deptName] || current.departments[deptName].status !== "pending") return null;
        const updated = { ...current.departments };
        const now = new Date().toISOString();
        updated[deptName] = { ...updated[deptName], acceptedAt: updated[deptName].acceptedAt || now, actionStatus: newStatus };
        
        if (newStatus === "Admit") updated[deptName].admittedAt = now;
        else if (newStatus === "คืน ER") updated[deptName].returnedAt = now;
        else if (newStatus === "D/C") updated[deptName].dischargedAt = now;

        return { departments: updated };
      }, { awaitRemote: false, onBackgroundError: () => addToast({ type: "error", message: "ระบบอัปเดตไม่สำเร็จ ข้อมูลกำลังรีเฟรช" }) });
      
      addToast({ type: "success", message: `อัปเดตสถานะเป็น "${newStatus}" สำเร็จ` });
    } catch (err) {
      console.error(err);
      addToast({ type: "error", message: "เกิดข้อผิดพลาด" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = async () => {
    if (isUpdating) return;
    setShowConfirm(false);
    setIsUpdating(true);
    try {
      await updateConsult(caseData.id, (current) => {
        if (!current.departments || !current.departments[deptName] || current.departments[deptName].status !== "pending") return null;
        const updated = { ...current.departments };
        updated[deptName] = { ...updated[deptName], status: "completed", completedAt: new Date().toISOString() };
        
        const allFinished = Object.values(updated).every((d: ConsultDepartment) => d.status === "completed" || d.status === "cancelled");
        return { departments: updated, ...(allFinished && { status: "completed" }) };
      }, { awaitRemote: false, onBackgroundError: () => addToast({ type: "error", message: "ระบบอัปเดตไม่สำเร็จ ข้อมูลกำลังรีเฟรช" }) });
      
      addToast({ type: "success", message: `ปิดเคส HN: ${caseData.hn} (${deptName}) สำเร็จ` });
    } catch (err) {
      console.error(err);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการปิดเคส" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = async () => {
    if (isUpdating) return;
    setShowCancelConfirm(false);
    setIsUpdating(true);
    try {
      await updateConsult(caseData.id, (current) => {
        if (!current.departments || !current.departments[deptName] || current.departments[deptName].status !== "pending") return null;
        const updated = { ...current.departments };
        updated[deptName] = { ...updated[deptName], status: "cancelled", completedAt: new Date().toISOString() };
        
        const allFinished = Object.values(updated).every((d: ConsultDepartment) => d.status === "completed" || d.status === "cancelled");
        return { departments: updated, ...(allFinished && { status: "completed" }) };
      }, { awaitRemote: false, onBackgroundError: () => addToast({ type: "error", message: "ระบบอัปเดตไม่สำเร็จ ข้อมูลกำลังรีเฟรช" }) });
      
      addToast({ type: "success", message: `ยกเลิกปรึกษา HN: ${caseData.hn} (${deptName}) สำเร็จ` });
    } catch (err) {
      console.error(err);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการยกเลิกปรึกษา" });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <div className={`p-1.5 rounded-lg border flex flex-row items-center gap-2 transition-all ${darkMode ? "bg-gray-800 border-gray-700 shadow-sm" : "bg-white border-[#C7CFDA]/50 shadow-sm"}`}>
        <span className={`font-bold text-xs min-w-[65px] truncate ${darkMode ? "text-gray-300" : "text-[#014167]"}`} title={deptName}>
          {deptName}
        </span>
        
        <div className="flex-1 flex gap-1 items-center h-7">
          {!isAccepted ? (
            <>
              <button
                onClick={handleAccept}
                disabled={isUpdating}
                className={`flex-1 h-full rounded text-[10px] font-bold transition-all ${isUpdating ? "bg-gray-400 text-white cursor-not-allowed" : "bg-[#699D5D] text-white hover:bg-[#5a8a4f]"}`}
              >
                {isUpdating ? "..." : "รับเคส"}
              </button>
              <button disabled className={`flex-1 h-full rounded text-[10px] font-bold cursor-not-allowed ${darkMode ? "bg-gray-700 text-gray-500" : "bg-gray-100 text-gray-400"}`}>
                ปิดเคส
              </button>
            </>
          ) : (
            <>
              <select
                value={actionStatus && actionStatus !== ACCEPT_STATUS ? actionStatus : ""}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isUpdating}
                className={`flex-1 h-full rounded text-[10px] font-bold border text-center appearance-none cursor-pointer ${
                  actionStatus && actionStatus !== ACCEPT_STATUS
                    ? (darkMode ? "bg-amber-500/20 text-amber-300 border-amber-500" : "bg-amber-400/10 text-amber-700 border-amber-400")
                    : (darkMode ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-50 text-[#014167] border-[#C7CFDA]")
                }`}
              >
                <option value="" disabled>สถานะ</option>
                {POST_ACCEPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={isUpdating || !isStatusSelected}
                className={`flex-1 h-full rounded text-[10px] font-bold transition-all ${
                  isUpdating || !isStatusSelected
                    ? darkMode
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 shadow-inner"
                    : "bg-[#E55143] text-white hover:bg-[#d44639]"
                }`}
              >
                {isUpdating ? "..." : "ปิดเคส"}
              </button>
            </>
          )}
          
          {isAccepted && (
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-bold ${darkMode ? "text-gray-400" : "text-[#014167]/70"}`}>
              {(() => {
                const milestones = [
                  { label: "รับ", time: acceptedTime, raw: dept?.acceptedAt, color: "text-[#699D5D]", icon: (
                    <svg className="w-2.5 h-2.5 text-[#699D5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )},
                  { label: "Admit", time: admittedTime, raw: dept?.admittedAt, color: "text-blue-600 dark:text-blue-400", icon: null },
                  { label: "คืน", time: returnedTime, raw: dept?.returnedAt, color: "text-amber-600 dark:text-amber-400", icon: null },
                  { label: "D/C", time: dischargedTime, raw: dept?.dischargedAt, color: "text-purple-600 dark:text-purple-400", icon: null },
                ].filter(m => m.time && m.raw);

                // Sort by raw timestamp descending to find latest 3
                const latest3 = [...milestones]
                  .sort((a, b) => new Date(b.raw!).getTime() - new Date(a.raw!).getTime())
                  .slice(0, 3);

                // Sort back into chronological order for display
                return milestones
                  .filter(m => latest3.includes(m))
                  .map((m, idx) => (
                    <React.Fragment key={m.label}>
                      <div className="flex items-center gap-0.5">
                        {m.icon || (idx > 0 && <span className="opacity-40">→</span>)}
                        <span className={m.color}>{m.label} {m.time}</span>
                      </div>
                    </React.Fragment>
                  ));
              })()}
            </div>
          )}

          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={isUpdating}
            className={`w-6 h-7 flex items-center justify-center rounded transition-colors ${darkMode ? "text-gray-500 hover:text-red-400 hover:bg-red-500/10" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}
            title="ยกเลิก"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="ปิดเคส"
        message={`คุณแน่ใจหรือไม่ที่จะปิดเคส HN: ${caseData.hn}${fullName ? ` (${fullName})` : ""} แผนก: ${deptName}?`}
        confirmText="ยืนยันปิดเคส"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={handleComplete}
        onCancel={() => setShowConfirm(false)}
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        title="ยกเลิกปรึกษา"
        message={`คุณต้องการยกเลิกการปรึกษา HN: ${caseData.hn}${fullName ? ` (${fullName})` : ""} แผนก: ${deptName}?`}
        confirmText="ยืนยันยกเลิก"
        cancelText="ไม่ยกเลิก"
        variant="warning"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </>
  );
}
