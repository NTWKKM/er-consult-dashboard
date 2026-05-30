"use client";

import React, { useState, useCallback } from "react";
import { useConsultActions, PostAcceptStatus } from "../hooks/useConsultActions";
import { Consult } from "@/lib/db";
import { POST_ACCEPT_STATUSES, ACCEPT_STATUS } from "@/lib/constants";
import ConfirmModal from "./ConfirmModal";
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

export default function ConsultCard({ caseData, caseId, departmentName, darkMode = false, onUpdate, animationDelay = 0 }: ConsultCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  const dept = caseData.departments[departmentName];
  const isTerminal = dept?.status === "completed" || dept?.status === "cancelled";
  const isAccepted = dept?.acceptedAt;
  const timeAgo = caseData.createdAt ? new Date(caseData.createdAt).toLocaleString("th-TH") : "-";

  const actionStatus = dept?.actionStatus || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;

  const {
    isUpdating,
    isSyncing,
    handleAccept,
    handleStatusChange,
    handleComplete,
    handleCancel,
  } = useConsultActions(caseId, departmentName, caseData.hn || "-", onUpdate);

  const handleAcceptCase = useCallback(async () => {
    if (document.startViewTransition) {
      document.startViewTransition(async () => {
        if (await handleAccept()) {
          setFlashSuccess(true);
          setTimeout(() => setFlashSuccess(false), 700);
        }
      });
    } else {
      if (await handleAccept()) {
        setFlashSuccess(true);
        setTimeout(() => setFlashSuccess(false), 700);
      }
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
        className={`transition-all duration-200 rounded-xl p-4 animate-stagger-in relative glass-panel flex flex-col gap-3 border-l-4 ${
          flashSuccess ? "animate-success-flash" : ""
        } ${
          caseData.isUrgent 
            ? "border-l-[#E55143] shadow-[0_0_15px_rgba(229,81,67,0.15)]" 
            : darkMode ? "border-l-gray-600" : "border-l-[#699D5D]"
        }`}
        style={{ animationDelay: `${animationDelay}ms` }}
      >
        {!isTerminal && (
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            disabled={isUpdating}
            className={`absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 text-xs font-bold z-10 tap-feedback ${
              isUpdating
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : darkMode
                ? "bg-gray-700/50 hover:bg-red-500/80 text-gray-400 hover:text-white"
                : "bg-gray-200/50 hover:bg-red-500/80 text-gray-500 hover:text-white"
            }`}
            title="ยกเลิกปรึกษา"
          >
            ✕
          </button>
        )}
        
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${darkMode ? "bg-gray-800" : "bg-white"} border ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
              <span className={`text-xs font-bold ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                {departmentName.substring(0,2)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className={`font-bold text-sm ${darkMode ? "text-gray-100" : "text-[#014167]"}`}>{departmentName}</span>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className={darkMode ? "text-gray-400" : "text-[#014167]/60"}>{timeAgo}</span>
                {isSyncing && <span className="text-[#699D5D] font-bold animate-pulse">⏳ Syncing</span>}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1 mt-1 pr-6">
            {!isTerminal && caseData.createdAt && <ElapsedTime createdAt={caseData.createdAt} />}
            {isTerminal && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#699D5D]/20 text-[#699D5D]">เสร็จสิ้น ✓</span>}
          </div>
        </div>

        {/* Milestones */}
        <div className="flex flex-col gap-1 text-xs">
          {(() => {
            const allMilestones = getMilestones(dept, formatTime);
            const milestonesToRender = isAccepted ? allMilestones : allMilestones.filter(m => m.icon === "transfer");
            if (milestonesToRender.length === 0) return null;

            return (
              <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] ${darkMode ? "text-gray-300" : "text-[#014167]"}`}>
                {milestonesToRender.map((m, idx, arr) => (
                  <React.Fragment key={`${m.label}-${m.raw}`}>
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${darkMode ? "bg-white/5" : "bg-black/5"}`}>
                      <span className={`font-semibold whitespace-nowrap ${darkMode ? m.colorDark : m.colorLight}`}>{m.label} {m.time}</span>
                    </div>
                    {idx < arr.length - 1 && <span className={darkMode ? "text-gray-600" : "text-[#014167]/40"}>→</span>}
                  </React.Fragment>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        {!isTerminal && (
          <div className="flex flex-col gap-2 mt-auto pt-2">
            <div className="flex gap-2">
              {!isAccepted ? (
                <>
                  <button
                    onClick={handleAcceptCase}
                    disabled={isUpdating}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 tap-feedback ${
                      isUpdating
                        ? darkMode ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-[#C7CFDA] text-[#014167] cursor-not-allowed"
                        : "bg-[#699D5D] text-white hover:shadow-md hover:bg-[#5a8a4f]"
                    }`}
                  >
                    {isUpdating ? "กำลังรับ..." : "รับเคส"}
                  </button>
                  <button disabled className={`flex-1 py-2 rounded-lg font-bold text-xs cursor-not-allowed flex items-center justify-center gap-1 opacity-50 ${darkMode ? "bg-gray-800 border border-dashed border-gray-600 text-gray-500" : "bg-gray-100 border border-dashed border-gray-300 text-gray-400"}`}>
                    ปิดเคส
                  </button>
                </>
              ) : (
                <>
                  <div className={`flex-1 relative ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}>
                    <select
                      value={actionStatus && actionStatus !== ACCEPT_STATUS ? actionStatus : ""}
                      onChange={(e) => handleStatusChange(e.target.value as PostAcceptStatus)}
                      className={`w-full h-full px-2 py-2 rounded-lg font-bold text-xs transition-all duration-200 appearance-none text-center cursor-pointer tap-feedback ${
                        actionStatus && actionStatus !== ACCEPT_STATUS
                          ? darkMode ? "bg-amber-500/20 text-amber-300 border border-amber-500" : "bg-amber-400/20 text-amber-700 border border-amber-500"
                          : darkMode ? "bg-gray-800/50 text-gray-300 border border-gray-600" : "bg-white/50 text-[#014167] border border-[#C7CFDA]"
                      }`}
                    >
                      <option value="" disabled>สถานะถัดไป</option>
                      {POST_ACCEPT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={isUpdating || !isStatusSelected}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1 tap-feedback ${
                      isUpdating || !isStatusSelected
                        ? darkMode ? "bg-gray-800/50 text-gray-500 cursor-not-allowed border border-dashed border-gray-700" : "bg-white/50 text-gray-400 cursor-not-allowed border border-dashed border-gray-300"
                        : "bg-[#E55143] text-white hover:shadow-md hover:bg-[#d44639]"
                    }`}
                  >
                    {isUpdating ? "กำลังปิด..." : "ปิดเคส"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="ปิดเคส"
        message={`คุณแน่ใจหรือไม่ที่จะปิดเคส HN: ${caseData.hn} แผนก: ${departmentName}?`}
        confirmText="ยืนยันปิดเคส"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={handleCompleteCase}
        onCancel={() => setShowConfirm(false)}
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        title="ยกเลิกปรึกษา"
        message={`คุณต้องการยกเลิกการปรึกษา HN: ${caseData.hn} แผนก: ${departmentName}?`}
        confirmText="ยืนยันยกเลิก"
        cancelText="ไม่ยกเลิก"
        variant="warning"
        onConfirm={handleCancelConsult}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </>
  );
}