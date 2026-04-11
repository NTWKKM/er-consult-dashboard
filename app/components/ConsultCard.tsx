"use client";

import React, { useState, useCallback } from "react";
import { useConsultActions, PostAcceptStatus } from "../hooks/useConsultActions";
import { Consult } from "@/lib/db";
import { POST_ACCEPT_STATUSES, ACCEPT_STATUS } from "@/lib/constants";
import ConfirmModal from "./ConfirmModal";
import { RoomTransferButton } from "./RoomTransferButton";
import { getMilestones, formatTime } from "@/lib/utils";
import { ElapsedTime } from "./ElapsedTime";

interface ConsultCardProps {
  caseData: Consult;
  caseId: string;
  departmentName: string;
  darkMode?: boolean;
  onUpdate?: () => void;
  animationDelay?: number;
}



function ConsultCard({ caseData, caseId, departmentName, darkMode = false, onUpdate, animationDelay = 0 }: ConsultCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  const hn = caseData.hn || "-";
  const firstName = caseData.firstName || "";
  const lastName = caseData.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const room = caseData.room;
  const problem = caseData.problem || "-";
  const isUrgent = caseData.isUrgent || false;
  const dept = caseData.departments[departmentName];
  const isTerminal = dept?.status === "completed" || dept?.status === "cancelled";
  const isAccepted = dept?.acceptedAt;
  const completedTime = dept?.completedAt
    ? new Date(dept.completedAt).toLocaleString("th-TH")
    : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt).toLocaleString("th-TH")
    : "-";

  const actionStatus = caseData.departments[departmentName]?.actionStatus || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;

  const {
    isUpdating,
    isSyncing,
    handleAccept,
    handleStatusChange,
    handleComplete,
    handleCancel,
  } = useConsultActions(caseId, departmentName, hn, onUpdate);

  const handleActionStatusChange = useCallback(async (newStatus: PostAcceptStatus) => {
    await handleStatusChange(newStatus);
  }, [handleStatusChange]);

  const handleAcceptCase = useCallback(async () => {
    if (await handleAccept()) {
      setFlashSuccess(true);
      setTimeout(() => setFlashSuccess(false), 700);
    }
  }, [handleAccept]);

  const handleCancelConsult = useCallback(async () => {
    setShowCancelConfirm(false);
    await handleCancel();
  }, [handleCancel]);

  const handleCompleteCase = useCallback(async () => {
    if (isTerminal) return;
    setShowConfirm(false);
    await handleComplete();
  }, [isTerminal, handleComplete]);

  return (
    <>
      <div
        className={`card-shadow hover:card-shadow-hover transition-all duration-200 rounded-lg p-3 hover:-translate-y-1 animate-stagger-in relative ${
          flashSuccess ? "animate-success-flash" : ""
        } ${
          darkMode
            ? `bg-gray-800 ${
                isUrgent
                  ? "border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30"
                  : "border-l-4 border-gray-700"
              }`
            : `bg-white/95 ${
                isUrgent
                  ? "border-l-4 border-[#E55143] ring-2 ring-[#E55143]/30"
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
                isUrgent ? "bg-[#E55143]" : "bg-[#699D5D]"
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
                <h3 className={`text-lg font-bold tabular-nums ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>
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
                <RoomTransferButton 
                  consultId={caseId}
                  currentRoom={room}
                  darkMode={darkMode}
                />
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
              <ElapsedTime createdAt={caseData.createdAt} />
            )}
          </div>
        </div>

        <div className={`mb-2 p-2 rounded-lg border ${darkMode ? "bg-gray-900/50 border-gray-700" : "bg-white/70 border-[#014167]/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03)]"}`}>
          <p className={`text-xs font-semibold mb-0.5 ${darkMode ? "text-gray-400" : "text-[#014167]/60"}`}>Dx:</p>
          <p className={`text-sm leading-snug whitespace-pre-wrap ${darkMode ? "text-gray-200" : "text-[#014167]"}`}>{problem}</p>
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
            {(() => {
              const allMilestones = getMilestones(dept, formatTime);
              const milestonesToRender = isAccepted 
                ? allMilestones 
                : allMilestones.filter(m => m.icon === "transfer");
                
              if (milestonesToRender.length === 0) return null;

              return (
                <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] sm:text-xs tracking-tight ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                  {milestonesToRender.map((m, idx, arr) => (
                    <React.Fragment key={`${m.label}-${m.raw}`}>
                      <div className="flex items-center gap-1">
                        {m.icon === "check" ? (
                          <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#699D5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : m.icon === "transfer" ? (
                          <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : null}
                        <span className={`font-semibold whitespace-nowrap ${darkMode ? m.colorDark : m.colorLight}`}>{m.label} {m.time}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <span className={darkMode ? "text-gray-600" : "text-[#014167]/40"}>→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
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
                        ? "bg-gray-800 border border-dashed border-gray-600 text-gray-500"
                        : "bg-gray-100 border border-dashed border-gray-300 text-gray-400"
                    }`}
                    title="กรุณารับเคสก่อน"
                  >
                    <svg className="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
                      onChange={(e) => handleActionStatusChange(e.target.value as PostAcceptStatus)}
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
                    title={!isStatusSelected ? "กรุณาเลือกสถานะก่อนปิดเคส" : undefined}
                    className={`flex-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 tap-feedback ${
                      isUpdating || !isStatusSelected
                        ? darkMode
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed border border-dashed border-gray-600"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed border border-dashed border-gray-300"
                        : "bg-[#E55143] text-white hover:shadow-lg glow-hover transform hover:-translate-y-0.5"
                    }`}
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