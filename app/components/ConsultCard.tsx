"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { updateConsult, Consult, ConsultDepartment } from "@/lib/db";
import { SURGERY_DEPTS, ORTHO_DEPTS, POST_ACCEPT_STATUSES, ACCEPT_STATUS } from "@/lib/constants";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "./ConfirmModal";

interface ConsultCardProps {
  caseData: Consult;
  caseId: string;
  departmentName: string;
  darkMode?: boolean;
  onUpdate?: () => void;
  animationDelay?: number;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit" });

const ElapsedTime = React.memo(function ElapsedTime({ createdAt, darkMode }: { createdAt: string; darkMode: boolean }) {
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

function ConsultCard({ caseData, caseId, departmentName, darkMode = false, onUpdate, animationDelay = 0 }: ConsultCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { addToast } = useToast();

  const pendingSyncCountRef = useRef(0);

  const beginSync = useCallback(() => {
    pendingSyncCountRef.current += 1;
    setIsSyncing(true);
  }, []);

  const endSync = useCallback(() => {
    pendingSyncCountRef.current = Math.max(0, pendingSyncCountRef.current - 1);
    setIsSyncing(pendingSyncCountRef.current > 0);
  }, []);

  const hn = caseData.hn || "-";
  const firstName = caseData.firstName || "";
  const lastName = caseData.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const room = caseData.room || "-";
  const problem = caseData.problem || "-";
  const isUrgent = caseData.isUrgent || false;
  const dept = caseData.departments[departmentName];
  const isTerminal = dept?.status === "completed" || dept?.status === "cancelled";
  const isAccepted = dept?.acceptedAt;
  const completedTime = dept?.completedAt
    ? new Date(dept.completedAt).toLocaleString("th-TH")
    : null;
  const acceptedTime = isAccepted ? formatTime(isAccepted) : null;
  const admittedTime = dept?.admittedAt ? formatTime(dept.admittedAt) : null;
  const returnedTime = dept?.returnedAt ? formatTime(dept.returnedAt) : null;
  const dischargedTime = dept?.dischargedAt ? formatTime(dept.dischargedAt) : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt).toLocaleString("th-TH")
    : "-";

  const actionStatus = caseData.departments[departmentName]?.actionStatus || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;

  const handleActionStatusChange = useCallback(async (newStatus: string) => {
    if (isUpdating) return;
    setIsUpdating(true); // Immediate local "busy" state
    beginSync();         // Track remote sync
    try {
      const result = await updateConsult(caseId, (current) => {
        // Guard against stale snapshots/missing departments
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const updatedDepartments = { ...current.departments };
        const now = new Date().toISOString();

        updatedDepartments[departmentName] = {
          ...updatedDepartments[departmentName],
          acceptedAt: updatedDepartments[departmentName].acceptedAt || now,
          actionStatus: newStatus,
        };

        if (newStatus === "Admit") {
          updatedDepartments[departmentName].admittedAt = now;
        } else if (newStatus === "คืน ER") {
          updatedDepartments[departmentName].returnedAt = now;
        } else if (newStatus === "D/C") {
          updatedDepartments[departmentName].dischargedAt = now;
        }

        return { departments: updatedDepartments };
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (result.consult === null && !result.isQueued) {
           endSync();
           setIsUpdating(false);
           return;
      }

      setIsUpdating(false); // Immediate UI release after local enqueue

      if (result.backgroundPromise) {
          result.backgroundPromise.then(() => {
              endSync();
          }).catch(() => {
              endSync();
          });
      } else {
          endSync();
      }
      
      addToast({ type: "success", message: `อัปเดตสถานะเป็น "${newStatus}" สำเร็จ` });
      onUpdate?.();
    } catch (error) {
      console.error("Error updating status:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
      setIsUpdating(false);
      endSync();
    }
  }, [isUpdating, caseId, departmentName, addToast, onUpdate, beginSync, endSync]);

  const handleAcceptCase = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        // Guard against stale snapshots/missing departments
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const updatedDepartments = { ...current.departments };
        const isSurgeryDept = (SURGERY_DEPTS as readonly string[]).includes(departmentName);
        const targetDepts = isSurgeryDept ? SURGERY_DEPTS : ORTHO_DEPTS;
        const now = new Date().toISOString();

        Object.keys(updatedDepartments).forEach((dept) => {
          if ((targetDepts as readonly string[]).includes(dept) && updatedDepartments[dept].status === "pending") {
            updatedDepartments[dept] = {
              ...updatedDepartments[dept],
              // ใช้ acceptedAt เดิมถ้ามีอยู่แล้ว ถ้าไม่มีถึงจะใช้เวลา now ป้องกันการเขียนทับ
              acceptedAt: updatedDepartments[dept].acceptedAt || now,
              actionStatus: ACCEPT_STATUS,
            };
          }
        });

        return { departments: updatedDepartments };
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (result.consult === null && !result.isQueued) {
           endSync();
           setIsUpdating(false);
           return;
      }

      setIsUpdating(false); // UI release

      if (result.backgroundPromise) {
          result.backgroundPromise.finally(() => {
              endSync();
          });
      } else {
          endSync();
      }

      addToast({ type: "success", message: `รับเคส HN: ${hn} สำเร็จ` });
      onUpdate?.();
    } catch (error) {
      console.error("Error accepting case:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการรับเคส" });
      setIsUpdating(false);
      endSync();
    }
  }, [isUpdating, caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync]);

  const handleCancelConsult = useCallback(async () => {
    if (isUpdating) return;
    setShowCancelConfirm(false);
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        // Guard against stale snapshots/missing departments
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const updatedDepartments = { ...current.departments };
        updatedDepartments[departmentName] = {
          ...updatedDepartments[departmentName],
          status: "cancelled",
          completedAt: new Date().toISOString(),
        };

        const allFinished = Object.values(updatedDepartments).every(
          (dept: ConsultDepartment) => dept.status === "completed" || dept.status === "cancelled"
        );

        return {
          departments: updatedDepartments,
          ...(allFinished && { status: "completed" }),
        };
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (result.consult === null && !result.isQueued) {
           endSync();
           setIsUpdating(false);
           return;
      }

      setIsUpdating(false); // UI release

      if (result.backgroundPromise) {
          result.backgroundPromise.finally(() => {
              endSync();
          });
      } else {
          endSync();
      }

      addToast({ type: "success", message: `ยกเลิกปรึกษา HN: ${hn} (${departmentName}) สำเร็จ` });
      onUpdate?.();
    } catch (error) {
      console.error("Error cancelling consult:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการยกเลิกปรึกษา" });
      setIsUpdating(false);
      endSync();
    }
  }, [isUpdating, caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync]);

  const handleCompleteCase = useCallback(async () => {
    if (isUpdating || isTerminal) return;
    setShowConfirm(false);
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        // Guard against stale snapshots/missing departments
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const updatedDepartments = { ...current.departments };
        updatedDepartments[departmentName] = {
          ...updatedDepartments[departmentName],
          status: "completed",
          completedAt: new Date().toISOString(),
        };
        const allCompleted = Object.values(updatedDepartments).every(
          (dept: ConsultDepartment) =>
            dept.status === "completed" || dept.status === "cancelled"
        );
        return {
          departments: updatedDepartments,
          ...(allCompleted && { status: "completed" }),
        };
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (result.consult === null && !result.isQueued) {
           endSync();
           setIsUpdating(false);
           return;
      }

      setIsUpdating(false); // UI release

      if (result.backgroundPromise) {
          result.backgroundPromise.finally(() => {
              endSync();
          });
      } else {
          endSync();
      }

      addToast({ type: "success", message: `ปิดเคส HN: ${hn} (${departmentName}) สำเร็จ` });
      onUpdate?.();
    } catch (error) {
      console.error("Error updating case:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการปิดเคส" });
      setIsUpdating(false);
      endSync();
    }
  }, [isUpdating, isTerminal, caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync]);

  return (
    <>
      <div
        className={`card-shadow hover:card-shadow-hover transition-all duration-200 rounded-lg p-3 hover:-translate-y-1 animate-stagger-in relative ${
          darkMode
            ? `bg-gray-800 ${
                isUrgent
                  ? "border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30 pulse-urgent"
                  : "border-l-4 border-gray-700"
              }`
            : `bg-[#C7CFDA] ${
                isUrgent
                  ? "border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30 pulse-urgent"
                  : "border-l-4 border-[#699D5D]/50"
              }`
        }`}
        style={{ animationDelay: `${animationDelay}ms` }}
      >
        {!isTerminal && (
          <button
            type="button"
            aria-label="ยกเลิกปรึกษา"
            onClick={() => setShowCancelConfirm(true)}
            disabled={isUpdating}
            className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 text-[10px] font-bold z-10 ${
              isUpdating
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : darkMode
                ? "bg-gray-600 hover:bg-red-500 text-gray-300 hover:text-white"
                : "bg-gray-400/80 hover:bg-red-500 text-white opacity-60 hover:opacity-100"
            }`}
            title="ยกเลิกปรึกษา"
          >
            ✕
          </button>
        )}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${
                isUrgent ? "bg-[#E55143] pulse-urgent" : "bg-[#699D5D]"
              }`}
            >
              {isUrgent ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-[#FDFCDF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-bold ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>
                  HN: {hn}
                </h3>
                {isUrgent && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-[#E55143] text-white shadow-md">
                    FAST
                  </span>
                )}
              </div>
              {fullName && (
                <p className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-[#014167]/80"}`}>
                  {fullName}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-semibold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>{departmentName}</span>
                <span className={darkMode ? "text-gray-600" : "text-[#C7CFDA]"}>•</span>
                <span className={`font-semibold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>{room}</span>
              </div>
              {Object.keys(caseData.departments).filter(
                (d) => d !== departmentName && caseData.departments[d].status === "pending"
              ).length > 0 && (
                <div className="flex items-center gap-1 text-xs mt-1">
                  <span className={`font-medium ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>แผนกอื่น:</span>
                  <span className={`font-semibold underline ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                    {Object.keys(caseData.departments)
                      .filter((d) => d !== departmentName && caseData.departments[d].status === "pending")
                      .join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isSyncing && (
              <span className="text-[9px] animate-pulse text-[#699D5D] font-bold">
                ⏳ Syncing...
              </span>
            )}
            {isTerminal && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#699D5D]/20 text-[#699D5D]">
                ✓
              </span>
            )}
            {!isTerminal && caseData.createdAt && (
              <ElapsedTime createdAt={caseData.createdAt} darkMode={darkMode} />
            )}
          </div>
        </div>

        <div className="mb-2 bg-[#014167]/40 p-2 rounded-lg border border-[#FDFCDF]/10">
          <p className="text-xs text-[#FDFCDF] font-semibold mb-0.5">Dx:</p>
          <p className="text-sm text-[#FDFCDF] leading-snug">{problem}</p>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-1 font-medium ${darkMode ? "text-gray-400" : "text-[#014167]"}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{timeAgo}</span>
            </div>
            {isTerminal && (
              <div className={`flex items-center gap-1 ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">{dept?.status === "cancelled" ? "ยกเลิก" : "ปิด"}: {completedTime}</span>
              </div>
            )}
            {isAccepted && (
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-[#699D5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold">รับเคส {acceptedTime}</span>
                </div>
                {admittedTime && (
                  <div className="flex items-center gap-1">
                    <span className="text-[#014167]/40 dark:text-gray-600">→</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">Admit {admittedTime}</span>
                  </div>
                )}
                {returnedTime && (
                  <div className="flex items-center gap-1">
                    <span className="text-[#014167]/40 dark:text-gray-600">→</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">คืน ER {returnedTime}</span>
                  </div>
                )}
                {dischargedTime && (
                  <div className="flex items-center gap-1">
                    <span className="text-[#014167]/40 dark:text-gray-600">→</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">D/C {dischargedTime}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {!isTerminal && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                {!isAccepted ? (
                  <>
                  <button
                    onClick={handleAcceptCase}
                    disabled={isUpdating}
                    className={`flex-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 ${
                      isUpdating
                        ? darkMode
                          ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                          : "bg-[#C7CFDA] text-[#014167] cursor-not-allowed"
                        : "bg-[#699D5D] text-white hover:shadow-lg glow-hover transform hover:-translate-y-0.5"
                    }`}
                  >
                    {isUpdating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>กำลังรับ...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>รับเคส</span>
                      </>
                    )}
                  </button>
                  <button
                    disabled
                    className={`flex-1 px-3 py-1.5 rounded-lg font-bold text-xs cursor-not-allowed flex items-center justify-center gap-1 ${
                      darkMode
                        ? "bg-gray-800 border border-gray-700 text-gray-500"
                        : "bg-gray-200 border border-gray-300 text-gray-400 shadow-inner"
                    }`}
                    title="ต้องรับเคสก่อนจึงจะปิดเคสได้"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>ปิดเคส</span>
                  </button>
                </>
              ) : (
                <>
                  <div className={`flex-1 relative ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}>
                    <select
                      aria-label="เลือกสถานะถัดไป"
                      value={actionStatus && actionStatus !== ACCEPT_STATUS ? actionStatus : ""}
                      onChange={(e) => handleActionStatusChange(e.target.value)}
                      className={`w-full h-full px-2 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 appearance-none text-center cursor-pointer ${
                        actionStatus && actionStatus !== ACCEPT_STATUS
                          ? darkMode
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500"
                            : "bg-amber-400/20 text-amber-700 border border-amber-500"
                          : darkMode
                          ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                          : "bg-amber-400/30 text-amber-700 border border-amber-500/50"
                      }`}
                    >
                      <option value="" disabled>
                        สถานะถัดไป
                      </option>
                      {POST_ACCEPT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <div
                      className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 ${
                        darkMode ? "text-amber-400" : "text-amber-600"
                      }`}
                    >
                      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={isUpdating || !isStatusSelected}
                    className={`flex-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 ${
                      isUpdating || !isStatusSelected
                        ? darkMode
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300 shadow-inner"
                        : "bg-[#E55143] text-white hover:shadow-lg glow-hover transform hover:-translate-y-0.5"
                    }`}
                    title={!isStatusSelected ? "กรุณาเลือกสถานะ (Admit, คืน ER, D/C) ก่อนปิดเคส" : "ปิดเคส"}
                  >
                    {isUpdating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>กำลังปิด...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>ปิดเคส</span>
                      </>
                    )}
                  </button>
                </>
              )}
              </div>
              {isAccepted && !isStatusSelected && (
                <div className={`text-center text-[10px] w-full pt-1 font-bold animate-pulse ${darkMode ? "text-amber-400" : "text-amber-600"}`}>
                  * กรุณาเลือกสถานะก่อนปิดเคส
                </div>
              )}
              {!isAccepted && (
                <div className={`text-center text-[10px] w-full pt-0.5 ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>
                  * ต้องรับเคสก่อนจึงจะปิดเคสได้
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="ปิดเคส"
        message={`คุณแน่ใจหรือไม่ที่จะปิดเคสของ HN: ${hn}${fullName ? ` (${fullName})` : ""} แผนก: ${departmentName}?`}
        confirmText="ยืนยันปิดเคส"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={handleCompleteCase}
        onCancel={() => setShowConfirm(false)}
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        title="ยกเลิกปรึกษา"
        message={`คุณต้องการยกเลิกการปรึกษา HN: ${hn}${fullName ? ` (${fullName})` : ""} แผนก: ${departmentName}? ${
          Object.values(caseData.departments).filter(d => d.status === 'pending').length <= 1 
            ? "เคสจะถูกย้ายไปยังเคสที่เสร็จแล้ว" 
            : "แผนกนี้จะถูกยกเลิกจากคำปรึกษา"
        }`}
        confirmText="ยืนยันยกเลิก"
        cancelText="ไม่ยกเลิก"
        variant="warning"
        onConfirm={handleCancelConsult}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </>
  );
}

export default React.memo(ConsultCard);