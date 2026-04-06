"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ConsultCard from "@/app/components/ConsultCard";
import SkeletonLoading from "@/app/components/SkeletonLoading";
import ErrorState from "@/app/components/ErrorState";
import { subscribeToConsultsByStatus, Consult } from "@/lib/db";
import { SURGERY_DEPTS, ORTHO_DEPTS } from "@/lib/constants";
import { findNewCaseIds } from "@/lib/utils";
import { useSettings } from "./contexts/SettingsContext";
import { buildDepartmentCasesMap, RoomFilter } from "@/lib/departmentCasesMap";

export default function Dashboard() {
  const [allCases, setAllCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"both" | "surgery" | "ortho">("both");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");

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

  const departmentCasesMap = useMemo(() => {
    return buildDepartmentCasesMap(allCases, roomFilter);
  }, [allCases, roomFilter]);

  const getCasesForDepartment = (deptName: string) => {
    return departmentCasesMap[deptName] || [];
  };

  const filteredAllCases = useMemo(() => {
    return allCases.filter((caseData) => {
      const isResus = caseData.room && caseData.room.toLowerCase().includes("resus");
      if (roomFilter === "resus" && !isResus) return false;
      if (roomFilter === "non-resus" && isResus) return false;
      return true;
    });
  }, [allCases, roomFilter]);

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
                    ? "text-[#E55143] pulse-urgent"
                    : darkMode
                    ? "text-gray-300"
                    : "text-[#014167]"
                }`}
              >
                {totalPendingCases}
              </span>
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
          </div>
        </div>

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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
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
                              ? "bg-[#E55143]/20 text-[#E55143] pulse-urgent"
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
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p
                            className={`font-medium text-xs ${
                              darkMode ? "text-gray-300" : "text-[#014167]"
                            }`}
                          >
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z"
                    />
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
                              ? "bg-[#E55143]/20 text-[#E55143] pulse-urgent"
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
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p
                            className={`font-medium text-xs ${
                              darkMode ? "text-gray-300" : "text-[#014167]"
                            }`}
                          >
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
      </div>
    </div>
  );
}
