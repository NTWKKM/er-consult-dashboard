"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useConsultActions, PostAcceptStatus } from "./hooks/useConsultActions";
import ConsultCard from "@/app/components/ConsultCard";
import SkeletonLoading from "@/app/components/SkeletonLoading";
import ErrorState from "@/app/components/ErrorState";
import ConfirmModal from "@/app/components/ConfirmModal";
import { RoomTransferButton } from "@/app/components/RoomTransferButton";
import { subscribeToConsultsByStatus, Consult } from "@/lib/db";
import { formatTime } from "@/lib/utils";
import { ElapsedTime as PatientTableElapsedTime } from "@/app/components/ElapsedTime";
import { MilestoneList } from "@/app/components/MilestoneList";
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

  const { soundEnabled, displayMode, setDisplayMode } = useSettings();

  const handleSetDisplayMode = (mode: "card" | "table") => {
    if (document.startViewTransition) {
      document.startViewTransition(() => setDisplayMode(mode));
    } else {
      setDisplayMode(mode);
    }
  };

  const handleSetView = (v: "both" | "surgery" | "ortho") => {
    if (document.startViewTransition) {
      document.startViewTransition(() => setView(v));
    } else {
      setView(v);
    }
  };

  const handleSetRoomFilter = (filter: RoomFilter) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => setRoomFilter(filter));
    } else {
      setRoomFilter(filter);
    }
  };

  const previousCaseIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const deptRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableHeadRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    if (displayMode !== "table") return;
    const container = tableContainerRef.current;
    const thead = tableHeadRef.current;
    if (!container || !thead) return;

    const syncScrollPadding = () => {
      const height = thead.getBoundingClientRect().height || thead.offsetHeight;
      if (height > 0) {
        container.style.scrollPaddingTop = `${Math.ceil(height)}px`;
      }
    };

    syncScrollPadding();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(syncScrollPadding);
      observer.observe(thead);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", syncScrollPadding);
    return () => window.removeEventListener("resize", syncScrollPadding);
  }, [displayMode]);

  const scrollToDepartment = (deptName: string) => {
    (Object.hasOwn(deptRefs.current, deptName) ? deptRefs.current[deptName] : null)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    // Wait for the initial snapshot before establishing the baseline so existing cases never trigger an alert
    if (loading) return;
    const currentIds = new Set(allCases.map((c) => c.id));
    if (!isInitialLoadRef.current) {
      const newIds = findNewCaseIds(currentIds, previousCaseIdsRef.current);
      if (newIds.length > 0) {
        playNotificationSound();
      }
    }
    previousCaseIdsRef.current = currentIds;
    isInitialLoadRef.current = false;
  }, [allCases, loading, playNotificationSound]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

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
    return (Object.hasOwn(departmentCasesMap, deptName) ? departmentCasesMap[deptName] : undefined) || [];
  };

  const totalPendingCases = visibleTableCases.length;

  if (loading) {
    return <SkeletonLoading />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] pb-24 lg:pb-8 bg-paper transition-colors duration-200">
      <div className="max-w-[1600px] mx-auto p-3 lg:p-5">
        {/* --- Toolbar --- */}
        <div className="mb-4 slide-in w-full flex justify-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-[10px] border border-rule bg-paper-2 transition-colors max-w-full">
            {/* Pending Count */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-paper-3 border border-rule">
              <svg aria-hidden="true" className="w-4 h-4 text-bad shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs font-medium text-ink-2 whitespace-nowrap">{"รอปรึกษา"}</span>
              <span className={`text-sm font-medium measured min-w-[28px] text-center px-2 py-0.5 rounded-[4px] ${
                totalPendingCases > 0
                  ? "bg-bad text-paper"
                  : "bg-paper-2 text-muted border border-rule"
              }`}>
                {totalPendingCases}
              </span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-7 bg-rule" />

            {/* Control Groups */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {/* Layout Toggle */}
              <div className="flex items-center p-0.5 rounded-[6px] border border-rule bg-paper-3">
                <button type="button" aria-label="Card" aria-pressed={displayMode === "card"} onClick={() => handleSetDisplayMode("card")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs flex items-center gap-1 tap-feedback whitespace-nowrap ${displayMode === "card" ? "bg-paper text-ink border border-rule" : "text-muted hover:text-ink border border-transparent"}`}>
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                  <span className="hidden sm:inline">{"Card"}</span>
                </button>
                <button type="button" aria-label="Table" aria-pressed={displayMode === "table"} onClick={() => handleSetDisplayMode("table")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs flex items-center gap-1 tap-feedback whitespace-nowrap ${displayMode === "table" ? "bg-paper text-ink border border-rule" : "text-muted hover:text-ink border border-transparent"}`}>
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  <span className="hidden sm:inline">{"Table"}</span>
                </button>
              </div>

              {/* Room Filter */}
              <div className="flex items-center p-0.5 rounded-[6px] border border-rule bg-paper-3">
                <button type="button" aria-pressed={roomFilter === "all"} onClick={() => handleSetRoomFilter("all")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs tap-feedback whitespace-nowrap ${roomFilter === "all" ? "bg-paper text-ink border border-rule" : "text-muted hover:text-ink border border-transparent"}`}>{"All"}</button>
                <button type="button" aria-pressed={roomFilter === "resus"} onClick={() => handleSetRoomFilter("resus")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs tap-feedback whitespace-nowrap ${roomFilter === "resus" ? "bg-bad text-paper" : "text-muted hover:text-ink"}`}>{"Resus"}</button>
                <button type="button" aria-pressed={roomFilter === "non-resus"} onClick={() => handleSetRoomFilter("non-resus")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs tap-feedback whitespace-nowrap ${roomFilter === "non-resus" ? "bg-ok text-paper" : "text-muted hover:text-ink"}`}>{"Non-Resus"}</button>
              </div>

              {/* View Filter (Card View Only) */}
              {displayMode === "card" && (
                <div className="flex items-center p-0.5 rounded-[6px] border border-rule bg-paper-3">
                  <button type="button" aria-pressed={view === "both"} onClick={() => handleSetView("both")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs tap-feedback whitespace-nowrap ${view === "both" ? "bg-paper text-ink border border-rule" : "text-muted hover:text-ink border border-transparent"}`}>{"Both"}</button>
                  <button type="button" aria-pressed={view === "surgery"} onClick={() => handleSetView("surgery")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs tap-feedback whitespace-nowrap ${view === "surgery" ? "bg-bad text-paper" : "text-muted hover:text-ink"}`}>{"Surgery"}</button>
                  <button type="button" aria-pressed={view === "ortho"} onClick={() => handleSetView("ortho")} className={`px-2.5 py-1.5 rounded-[4px] font-medium transition-colors duration-200 text-xs tap-feedback whitespace-nowrap ${view === "ortho" ? "bg-ok text-paper" : "text-muted hover:text-ink"}`}>{"Ortho"}</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Navigation - Always visible in card mode */}
        {displayMode === "card" && (
          <div className="mb-4 rounded-[10px] overflow-hidden border border-rule bg-paper-2 transition-colors">
            <div
              className={`flex overflow-x-auto lg:grid ${
                view === "surgery"
                  ? "lg:grid-cols-8"
                  : view === "ortho"
                    ? "lg:grid-cols-1"
                    : "lg:grid-cols-9"
              } gap-1.5 p-2 hide-scrollbar`}
            >
              {(
                view === "surgery"
                  ? SURGERY_DEPTS
                  : view === "ortho"
                    ? ORTHO_DEPTS
                    : [...SURGERY_DEPTS, ...ORTHO_DEPTS]
              ).map((dept) => {
                const cases = getCasesForDepartment(dept);
                const isSurgery = (SURGERY_DEPTS as readonly string[]).includes(dept);
                const hasCases = cases.length > 0;
                return (
                  <button
                    type="button"
                    key={dept}
                    onClick={() => scrollToDepartment(dept)}
                    className={`flex-shrink-0 min-w-[96px] sm:min-w-[104px] lg:min-w-0 rounded-[6px] px-2.5 py-2 transition-colors duration-200 group flex flex-col items-center justify-center border tap-feedback ${
                      hasCases
                        ? isSurgery
                          ? "bg-paper text-ink border-bad/40 hover:bg-bad hover:text-paper"
                          : "bg-paper text-ink border-ok/40 hover:bg-ok hover:text-paper"
                        : "bg-paper-3 text-muted border-rule hover:border-rule-2"
                    }`}
                  >
                    <div className="text-[11px] font-medium mb-0.5 w-full whitespace-nowrap text-center" title={dept}>{dept}</div>
                    <div
                      className={`text-base font-medium leading-none measured ${
                        hasCases
                          ? isSurgery
                            ? "text-bad group-hover:text-paper"
                            : "text-ok group-hover:text-paper"
                          : "text-muted"
                      }`}
                    >
                      {cases.length}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------ */}
        {/* RENDER LOGIC: TABLE VIEW OR CARD VIEW */}
        {/* ------------------------------------------------------------------------ */}

        {displayMode === "table" ? (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block rounded-[10px] border border-rule bg-paper-2 overflow-hidden transition-colors duration-200 slide-in">
              <div
                ref={tableContainerRef}
                style={{ scrollPaddingTop: "2.75rem" }}
                className="overflow-auto max-h-[70vh] relative w-full table-container"
              >
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead ref={tableHeadRef} className="sticky top-0 z-10 text-xs bg-paper-3 text-muted border-b border-rule">
                    <tr>
                      <th className="p-3 w-[20%] font-medium">{"Patient"}</th>
                      <th className="p-3 w-[10%] font-medium">{"Room"}</th>
                      <th className="p-3 w-[40%] font-medium">{"Dx"}</th>
                      <th className="p-3 w-[30%] font-medium">{"Management"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule bg-paper-2">
                    {visibleTableCases.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center font-medium text-muted">
                          ไม่มีเคสรอปรึกษา
                        </td>
                      </tr>
                    ) : (
                      visibleTableCases.map((caseData) => (
                        <PatientTableRow key={caseData.id} caseData={caseData} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Stacked Card Layout */}
            <div className="md:hidden flex flex-col gap-3 slide-in">
              {visibleTableCases.length === 0 ? (
                <div className="text-center py-8 rounded-[10px] border border-rule bg-paper-2 font-medium text-muted">
                  ไม่มีเคสรอปรึกษา
                </div>
              ) : (
                visibleTableCases.map((caseData) => (
                  <MobilePatientCard key={caseData.id} caseData={caseData} />
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
                } rounded-[10px] border border-rule bg-paper-2 transition-colors duration-200 slide-in min-w-0`}
              >
                <div className="bg-bad text-paper px-5 py-3 border-b border-bad rounded-t-[9px]">
                  <h2 className="text-lg font-medium flex items-center gap-2">
                    <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    Surgery
                    <span className="text-paper/80 text-xs font-normal ml-1 hidden sm:inline">แผนกศัลยกรรม</span>
                  </h2>
                </div>
                <div
                  className={`p-4 grid gap-4 ${
                    view === "both"
                      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  }`}
                >
                  {SURGERY_DEPTS.map((dept) => {
                    const cases = getCasesForDepartment(dept);
                    return (
                      <div
                        key={dept}
                        className="flex flex-col gap-2 scroll-mt-20 min-w-0"
                        ref={(el) => {
                          if (el) Reflect.set(deptRefs.current, dept, el);
                        }}
                      >
                        <div className="flex items-center justify-between px-3 py-2 rounded-[6px] border border-rule bg-paper-3">
                          <h3 className="text-sm font-medium text-ink">{dept}</h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium measured ${
                              cases.length > 0
                                ? "bg-bad-soft text-bad border border-bad/30"
                                : "bg-ok-soft text-ok border border-ok/30"
                            }`}
                          >
                            {cases.length}
                          </span>
                        </div>
                        {cases.length === 0 ? (
                          <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-[6px] border border-rule bg-paper">
                            <svg aria-hidden="true" className="w-4 h-4 text-ok shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="font-medium text-xs text-muted">
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
                } rounded-[10px] border border-rule bg-paper-2 transition-colors duration-200 slide-in min-w-0`}
              >
                <div className="bg-ok text-paper px-5 py-3 border-b border-ok rounded-t-[9px]">
                  <h2 className="text-lg font-medium flex items-center gap-2">
                    <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-3.5 0-6 2.5-6 6v3c0 1.5-1 2.5-2 3.5-.5.5-.5 1 0 1.5.5.5 1 .5 1.5 0 1.5-1.5 2.5-3 2.5-5v-3c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5v3c0 2 1 3.5 2.5 5 .5.5 1 .5 1.5 0s.5-1 0-1.5c-1-1-2-2-2-3.5v-3c0-3.5-2.5-6-6-6z" />
                    </svg>
                    Ortho
                    <span className="text-paper/80 text-xs font-normal ml-1 hidden sm:inline">ศัลยกรรมกระดูก</span>
                  </h2>
                </div>
                <div className="p-4">
                  {ORTHO_DEPTS.map((dept) => {
                    const cases = getCasesForDepartment(dept);
                    return (
                      <div
                        key={dept}
                        className="flex flex-col gap-2 max-w-full scroll-mt-20 min-w-0"
                        ref={(el) => {
                          if (el) Reflect.set(deptRefs.current, dept, el);
                        }}
                      >
                        <div className="flex items-center justify-between px-3 py-2 rounded-[6px] border border-rule bg-paper-3">
                          <h3 className="text-sm font-medium text-ink">{dept}</h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium measured ${
                              cases.length > 0
                                ? "bg-bad-soft text-bad border border-bad/30"
                                : "bg-ok-soft text-ok border border-ok/30"
                            }`}
                          >
                            {cases.length}
                          </span>
                        </div>
                        {cases.length === 0 ? (
                          <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-[6px] border border-rule bg-paper">
                            <svg aria-hidden="true" className="w-4 h-4 text-ok shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="font-medium text-xs text-muted">
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

function MobilePatientCard({ caseData }: { caseData: Consult }) {
  const { isUpdating, handleToggleUrgency } = useConsultActions(caseData.id, "", caseData.hn);
  const [showUrgencyConfirm, setShowUrgencyConfirm] = useState(false);

  const pendingDepts = Object.keys(caseData.departments).filter(
    (d) => caseData.departments[d].status === "pending"
  );

  if (pendingDepts.length === 0) return null;

  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");
  const sentTimeFull = caseData.createdAt
    ? formatTime(caseData.createdAt)
    : "";

  const onToggleUrgencyClick = () => {
    if (isUpdating) return;
    setShowUrgencyConfirm(true);
  };

  const confirmToggleUrgency = async () => {
    setShowUrgencyConfirm(false);
    await handleToggleUrgency(caseData.isUrgent);
  };

  return (
    <div className="p-4 rounded-[10px] border border-rule bg-paper-2 flex flex-col gap-3 min-w-0">
      {/* Header: HN & Fast Track */}
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap min-w-0">
            <span className="text-lg font-medium measured text-ink break-all">{caseData.hn}</span>
            <button
              type="button"
              onClick={onToggleUrgencyClick}
              disabled={isUpdating}
              title={caseData.isUrgent ? "เปลี่ยนเป็นเคสปกติ" : "เปลี่ยนเป็นเคส FAST TRACK"}
              aria-label={caseData.isUrgent ? "เปลี่ยนเป็นเคสปกติ" : "เปลี่ยนเป็นเคส FAST TRACK"}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border shrink-0 ${
                caseData.isUrgent
                  ? "bg-bad text-paper border-bad"
                  : "bg-paper-3 border-rule-2 text-muted hover:text-bad hover:border-bad/40"
              }`}
            >
              <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {caseData.isUrgent ? "FAST" : "NORMAL"}
            </button>
          </div>
          {fullName && (
            <div className="text-sm font-medium text-ink-2 break-words">
              {fullName}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="px-2 py-1 rounded-[4px] text-xs font-medium bg-paper-3 border border-rule text-ink">
              {caseData.room}
            </span>
            <RoomTransferButton
              consultId={caseData.id}
              currentRoom={caseData.room}
            />
          </div>
        </div>
      </div>

      {/* DX Section */}
      <div className="text-sm p-3 rounded-[6px] border border-rule bg-paper-3 text-ink min-w-0">
        <div className="text-xs font-medium mb-1 text-muted">{"Dx / Problem"}</div>
        <div className="whitespace-pre-wrap break-words">{caseData.problem}</div>
      </div>

      {/* Time Info */}
      <div className="flex flex-wrap justify-between items-center gap-2 text-[11px] measured text-muted">
        <div className="flex items-center gap-1">
           <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           {sentTimeFull}
        </div>
        <PatientTableElapsedTime createdAt={caseData.createdAt || ""} />
      </div>

      {/* Management Actions */}
      <div className="flex flex-col gap-2 mt-1">
        {pendingDepts.map(dept => (
          <DepartmentActionPanel key={dept} caseData={caseData} deptName={dept} />
        ))}
      </div>
      <ConfirmModal
        isOpen={showUrgencyConfirm}
        title={caseData.isUrgent ? "ยกเลิก FAST TRACK" : "เปลี่ยนเป็น FAST TRACK"}
        message={`คุณต้องการเปลี่ยนเคส HN: ${caseData.hn} ${caseData.isUrgent ? "กลับเป็นเคสปกติ" : "เป็นเคส FAST TRACK (ด่วน)"} หรือไม่?`}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        variant={caseData.isUrgent ? "warning" : "danger"}
        onConfirm={confirmToggleUrgency}
        onCancel={() => setShowUrgencyConfirm(false)}
      />
    </div>
  );
}

function PatientTableRow({ caseData }: { caseData: Consult }) {
  const { isUpdating, handleToggleUrgency } = useConsultActions(caseData.id, "", caseData.hn);
  const [showUrgencyConfirm, setShowUrgencyConfirm] = useState(false);

  // กรองเฉพาะแผนกที่สถานะยังรออยู่ (pending) ของเคสนี้
  const pendingDepts = Object.keys(caseData.departments).filter(
    (d) => (Object.hasOwn(caseData.departments, d) ? caseData.departments[d] : undefined)?.status === "pending"
  );

  if (pendingDepts.length === 0) return null;

  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");
  const sentTimeFull = caseData.createdAt
    ? formatTime(caseData.createdAt)
    : "";

  const onToggleUrgencyClick = () => {
    if (isUpdating) return;
    setShowUrgencyConfirm(true);
  };

  const confirmToggleUrgency = async () => {
    setShowUrgencyConfirm(false);
    await handleToggleUrgency(caseData.isUrgent);
  };

  return (
    <tr className="transition-colors align-top hover:bg-paper-3/60">
      <td className="p-3 align-top text-ink">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium measured whitespace-nowrap">{caseData.hn}</span>
          <button
            type="button"
            onClick={onToggleUrgencyClick}
            disabled={isUpdating}
            title={caseData.isUrgent ? "เปลี่ยนเป็นเคสปกติ" : "เปลี่ยนเป็นเคส FAST TRACK"}
            aria-label={caseData.isUrgent ? "เปลี่ยนเป็นเคสปกติ" : "เปลี่ยนเป็นเคส FAST TRACK"}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border shrink-0 ${
              caseData.isUrgent
                ? "bg-bad text-paper border-bad"
                : "bg-paper-3 border-rule-2 text-muted hover:text-bad hover:border-bad/40"
            }`}
          >
            <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {caseData.isUrgent ? "FAST" : "NORMAL"}
          </button>
        </div>
        {fullName && (
          <div className="text-sm font-medium mb-2 text-ink-2 break-words max-w-[180px]">
            {fullName}
          </div>
        )}
        <div className="text-[11px] measured flex flex-col gap-1 text-muted">
          <div className="flex items-center gap-1 whitespace-nowrap">
             <svg aria-hidden="true" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             {sentTimeFull}
          </div>
          <PatientTableElapsedTime createdAt={caseData.createdAt || ""} />
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="px-2 py-1 rounded-[4px] text-xs font-medium bg-paper-3 border border-rule text-ink">
            {caseData.room}
          </span>
          <RoomTransferButton 
            consultId={caseData.id}
            currentRoom={caseData.room}
          />
        </div>
      </td>
      <td className="p-3 text-sm whitespace-pre-wrap break-words max-w-md text-ink">
        {caseData.problem}
      </td>
      <td className="p-3">
        <div className="flex flex-col gap-2">
          {pendingDepts.map(dept => (
            <DepartmentActionPanel key={dept} caseData={caseData} deptName={dept} />
          ))}
        </div>
      </td>
      <ConfirmModal
        isOpen={showUrgencyConfirm}
        title={caseData.isUrgent ? "ยกเลิก FAST TRACK" : "เปลี่ยนเป็น FAST TRACK"}
        message={`คุณต้องการเปลี่ยนเคส HN: ${caseData.hn} ${caseData.isUrgent ? "กลับเป็นเคสปกติ" : "เป็นเคส FAST TRACK (ด่วน)"} หรือไม่?`}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        variant={caseData.isUrgent ? "warning" : "danger"}
        onConfirm={confirmToggleUrgency}
        onCancel={() => setShowUrgencyConfirm(false)}
      />
    </tr>
  );
}

function DepartmentActionPanel({ caseData, deptName }: { caseData: Consult; deptName: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const dept = Object.hasOwn(caseData.departments, deptName) ? caseData.departments[deptName] : undefined;
  const isAccepted = !!dept?.acceptedAt;
  const actionStatus = dept?.actionStatus || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;
  const fullName = [caseData.firstName, caseData.lastName].filter(Boolean).join(" ");

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
      <div className="p-2 rounded-[6px] border border-rule bg-paper flex flex-col sm:flex-row sm:items-start gap-2 transition-colors min-w-0">
        <span className="font-medium text-xs sm:min-w-[80px] whitespace-nowrap sm:mt-1.5 text-ink" title={deptName}>
          {deptName}
        </span>
        
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 w-full">
          <div className="flex gap-2 items-stretch min-h-8">
            {!isAccepted ? (
              <>
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={isUpdating}
                  className={`flex-1 min-w-0 px-2 rounded-[6px] text-xs font-medium transition-opacity flex items-center justify-center gap-1 whitespace-nowrap ${
                    isUpdating
                      ? "bg-paper-3 text-muted cursor-not-allowed border border-rule"
                      : "bg-ok text-paper hover:opacity-90"
                  }`}
                >
                  {isUpdating ? "…" : (
                    <>
                      <svg aria-hidden="true" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      รับเคส
                    </>
                  )}
                </button>
                <button type="button" disabled className="flex-1 min-w-0 px-2 rounded-[6px] text-xs font-medium flex items-center justify-center gap-1 cursor-not-allowed bg-paper-3 border border-dashed border-rule-2 text-muted whitespace-nowrap">
                  <svg aria-hidden="true" className="w-3 h-3 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  ปิดเคส
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0 relative">
                  <select
                    aria-label={`เลือกสถานะสำหรับ ${deptName}`}
                    value={actionStatus && actionStatus !== ACCEPT_STATUS ? actionStatus : ""}
                    onChange={(e) => onStatusChange(e.target.value as PostAcceptStatus)}
                    disabled={isUpdating}
                    className={`w-full h-full rounded-[6px] text-xs font-medium border appearance-none cursor-pointer pl-2 pr-6 focus:outline-none focus:ring-2 focus:ring-focus transition-colors ${
                      actionStatus && actionStatus !== ACCEPT_STATUS
                        ? "bg-accent-soft text-accent border-accent"
                        : "bg-paper-3 text-ink border-rule-2"
                    }`}
                  >
                    <option value="" disabled>สถานะ</option>
                    {POST_ACCEPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-muted">
                    <svg aria-hidden="true" className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={isUpdating || !isStatusSelected}
                  className={`flex-1 min-w-0 px-2 rounded-[6px] text-xs font-medium flex items-center justify-center gap-1 transition-opacity whitespace-nowrap ${
                    isUpdating || !isStatusSelected
                      ? "bg-paper-3 text-muted cursor-not-allowed border border-dashed border-rule-2"
                      : "bg-bad text-paper hover:opacity-90"
                  }`}
                >
                  {isUpdating ? "…" : (
                    <>
                      <svg aria-hidden="true" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      ปิดเคส
                    </>
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              disabled={isUpdating}
              className="w-8 h-8 flex items-center justify-center rounded-[6px] transition-colors border border-rule bg-paper-3 text-muted hover:text-bad hover:bg-bad-soft hover:border-bad/40"
              title="ยกเลิก"
              aria-label="ยกเลิกการปรึกษา"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <MilestoneList dept={dept} isAccepted={true} variant="inline" />
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
