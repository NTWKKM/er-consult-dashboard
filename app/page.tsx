"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { subscribeToConsultsByStatus, Consult } from "@/lib/db";
import { findNewCaseIds } from "@/lib/utils";
import { useSettings } from "./contexts/SettingsContext";
import { type RoomFilter, matchesRoomFilter } from "@/lib/departmentCasesMap";
import { SURGERY_DEPTS } from "@/lib/constants";
import SkeletonLoading from "@/app/components/SkeletonLoading";
import ErrorState from "@/app/components/ErrorState";
import ConsultCard from "@/app/components/ConsultCard";
import { RoomTransferButton } from "@/app/components/RoomTransferButton";

export default function Dashboard() {
  const [allCases, setAllCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    try {
      const savedRoomFilter = localStorage.getItem("dashboard_roomFilter");
      if (savedRoomFilter === "all" || savedRoomFilter === "resus" || savedRoomFilter === "non-resus") {
        setRoomFilter(savedRoomFilter as RoomFilter);
      }
    } catch (e) {
      console.warn("Failed to load settings from localStorage:", e);
    } finally {
      settingsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    try {
      localStorage.setItem("dashboard_roomFilter", roomFilter);
    } catch (e) {
      console.warn("Failed to save settings to localStorage:", e);
    }
  }, [roomFilter]);

  const { darkMode, soundEnabled } = useSettings();

  const previousCaseIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);

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
    if (!audioContextRef.current) initAudioContext();
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
      if (newIds.length > 0) playNotificationSound();
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

  const visibleCases = useMemo(
    () =>
      filteredAllCases.filter((caseData) =>
        Object.values(caseData.departments).some((dept) => dept.status === "pending")
      ),
    [filteredAllCases]
  );

  const totalPendingCases = visibleCases.length;

  const handleSelectCase = (id: string | null) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => setSelectedCaseId(id));
    } else {
      setSelectedCaseId(id);
    }
  };

  const selectedCase = useMemo(() => visibleCases.find(c => c.id === selectedCaseId), [visibleCases, selectedCaseId]);

  if (loading) return <SkeletonLoading darkMode={darkMode} />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;

  return (
    <div className={`min-h-[calc(100vh-100px)] transition-colors duration-300 ${darkMode ? "bg-gray-900" : ""}`}>
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5 flex flex-col h-full lg:h-[calc(100vh-80px)]">
        {/* Toolbar */}
        <div className="mb-4 slide-in w-full flex justify-center shrink-0">
          <div className={`inline-flex items-center gap-3 p-3 rounded-xl shadow-sm border glass-panel ${darkMode ? "dark" : ""}`}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? "bg-gray-900/60" : "bg-[#014167]/5"}`}>
              <svg className="w-4 h-4 text-[#E55143] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className={`text-xs font-bold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>รอปรึกษา</span>
              <span className={`text-base font-extrabold tabular-nums min-w-[28px] text-center px-2 py-0.5 rounded-full ${totalPendingCases > 0 ? "bg-[#E55143] text-white shadow-sm" : darkMode ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-400"}`}>
                {totalPendingCases}
              </span>
            </div>
            <div className={`w-px h-7 ${darkMode ? "bg-gray-700" : "bg-[#C7CFDA]/40"}`} />
            <div className={`flex items-center p-0.5 rounded-lg border ${darkMode ? "bg-gray-900 border-gray-700" : "bg-gray-100 border-gray-200"}`}>
              <button onClick={() => setRoomFilter("all")} className={`px-2.5 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${roomFilter === "all" ? (darkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-[#014167] shadow-sm") : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}>All</button>
              <button onClick={() => setRoomFilter("resus")} className={`px-2.5 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${roomFilter === "resus" ? "bg-[#E55143] text-white shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}>Resus</button>
              <button onClick={() => setRoomFilter("non-resus")} className={`px-2.5 py-1.5 rounded-md font-bold transition-all duration-200 text-xs ${roomFilter === "non-resus" ? "bg-[#699D5D] text-white shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}>Non-Resus</button>
            </div>
          </div>
        </div>

        {/* Split Screen Layout */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
          
          {/* Left Panel: Patient Roster */}
          <div className={`w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-2 overflow-y-auto hide-scrollbar rounded-xl p-3 glass-panel ${darkMode ? "dark" : ""} slide-in h-[40vh] lg:h-full`}>
            <h2 className={`font-bold text-sm mb-2 px-1 flex-shrink-0 ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>Patient Roster</h2>
            {visibleCases.length === 0 ? (
              <div className={`text-center py-8 rounded-lg border font-bold text-sm ${darkMode ? "bg-gray-800/50 border-gray-700 text-gray-500" : "bg-gray-50 border-[#C7CFDA]/50 text-[#014167]/50"}`}>
                ไม่มีเคสรอปรึกษา
              </div>
            ) : (
              visibleCases.map(caseData => {
                const isSelected = caseData.id === selectedCaseId;
                const pendingDepts = Object.keys(caseData.departments).filter(d => caseData.departments[d].status === "pending");
                const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");
                
                return (
                  <button
                    key={caseData.id}
                    onClick={() => handleSelectCase(caseData.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all duration-200 tap-feedback flex flex-col gap-2 relative overflow-hidden flex-shrink-0 ${
                      isSelected 
                        ? darkMode ? "bg-gray-800 border-blue-500/50 shadow-md ring-1 ring-blue-500/30" : "bg-white border-blue-400 shadow-md ring-1 ring-blue-400/30"
                        : darkMode ? "bg-gray-800/40 border-gray-700 hover:bg-gray-800/80 hover:border-gray-600" : "bg-white/60 border-[#C7CFDA]/40 hover:bg-white hover:border-[#C7CFDA]"
                    }`}
                  >
                    {caseData.isUrgent && <div className="absolute top-0 left-0 w-1 h-full bg-[#E55143]" />}
                    <div className="flex justify-between items-start pl-1">
                      <div className="flex flex-col">
                        <span className={`font-bold tabular-nums ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>HN: {caseData.hn}</span>
                        {fullName && <span className={`text-xs font-medium ${darkMode ? "text-gray-400" : "text-[#014167]/70"}`}>{fullName}</span>}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{caseData.room}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pl-1">
                      {pendingDepts.map(dept => (
                        <span key={dept} className={`text-[9px] px-1.5 py-0.5 rounded-sm font-semibold ${(SURGERY_DEPTS as readonly string[]).includes(dept) ? "bg-[#E55143]/10 text-[#E55143]" : "bg-[#699D5D]/10 text-[#699D5D]"}`}>{dept}</span>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Panel: Active Consult Details */}
          <div className={`w-full lg:w-2/3 xl:w-3/4 flex flex-col rounded-xl overflow-y-auto hide-scrollbar glass-panel @container ${darkMode ? "dark" : ""} slide-in flex-1`}>
            {selectedCase ? (
              <div className="p-4 sm:p-6 flex flex-col gap-6 animate-fade-in h-full">
                {/* Active Case Header */}
                <div className="flex flex-col @md:flex-row justify-between items-start @md:items-center gap-4 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${selectedCase.isUrgent ? "bg-[#E55143]" : "bg-[#699D5D]"}`}>
                      <svg className={`w-6 h-6 ${selectedCase.isUrgent ? "text-white" : "text-[#FDFCDF]"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h2 className={`text-2xl font-black tabular-nums ${darkMode ? "text-white" : "text-[#014167]"}`}>HN: {selectedCase.hn}</h2>
                        {selectedCase.isUrgent && <span className="px-2 py-1 rounded text-xs font-bold bg-[#E55143] text-white shadow-sm">FAST</span>}
                      </div>
                      <span className={`text-sm font-medium ${darkMode ? "text-gray-400" : "text-[#014167]/80"}`}>
                        {[selectedCase.firstName, selectedCase.lastName].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm ${darkMode ? "bg-gray-800 text-gray-200 border border-gray-700" : "bg-white text-[#014167] border border-[#C7CFDA]/50"}`}>
                      {selectedCase.room}
                    </span>
                    <RoomTransferButton consultId={selectedCase.id} currentRoom={selectedCase.room} darkMode={darkMode} />
                    <button onClick={() => handleSelectCase(null)} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors tap-feedback shadow-sm border ${darkMode ? "bg-gray-800 text-gray-400 hover:text-white border-gray-700" : "bg-white text-gray-500 hover:text-gray-900 border-[#C7CFDA]/50"}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Dx Section */}
                <div className={`p-4 rounded-xl shadow-inner flex-shrink-0 ${darkMode ? "bg-gray-900/80 border border-gray-800" : "bg-gray-50 border border-gray-200"}`}>
                  <h3 className={`text-xs font-bold mb-1 opacity-70 ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>Diagnosis / Problem</h3>
                  <p className={`text-base whitespace-pre-wrap font-medium ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>{selectedCase.problem}</p>
                </div>

                {/* Departments Grid */}
                <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto hide-scrollbar">
                  <h3 className={`text-sm font-bold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>แผนกที่รอรับปรึกษา</h3>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4 pb-4">
                    {Object.keys(selectedCase.departments)
                      .filter(dept => selectedCase.departments[dept].status === "pending")
                      .map((dept, idx) => (
                        <ConsultCard
                          key={dept}
                          caseData={selectedCase}
                          caseId={selectedCase.id}
                          departmentName={dept}
                          darkMode={darkMode}
                          animationDelay={idx * 50}
                        />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-50 animate-fade-in p-8 text-center">
                <svg className={`w-16 h-16 mb-4 ${darkMode ? "text-gray-600" : "text-[#C7CFDA]"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className={`text-lg font-bold ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>โปรดเลือกเคสจากรายชื่อด้านซ้าย</h3>
                <p className={`text-sm mt-2 max-w-sm ${darkMode ? "text-gray-500" : "text-[#014167]/60"}`}>เลือกเคสผู้ป่วยเพื่อดูรายละเอียดการปรึกษา ประวัติ และอัปเดตสถานะการรับเคส</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
