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
  // Defensive programming: If you pass onUpdate, ensure it is wrapped in useCallback 
  // to prevent breaking the React.memo optimization of ConsultCard.
  onUpdate?: () => void;
  animationDelay?: number;
}



function ConsultCard({ caseData, caseId, departmentName, darkMode = false, onUpdate, animationDelay = 0 }: ConsultCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showUrgencyConfirm, setShowUrgencyConfirm] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);

  const hn = caseData.hn || "-";
  const firstName = caseData.firstName || "";
  const lastName = caseData.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const room = caseData.room;
  const normalizedRoom = room?.trim().toLowerCase() ?? "";
  const isResusRoom = /\bresus\b/.test(normalizedRoom) && !/\bnon[-\s]?resus\b/.test(normalizedRoom);
  const problem = caseData.problem || "-";
  const isUrgent = caseData.isUrgent || false;
  const dept = Reflect.get(caseData.departments, departmentName);
  const isTerminal = dept?.status === "completed" || dept?.status === "cancelled";
  const isAccepted = dept?.acceptedAt;
  const completedTime = dept?.completedAt
    ? new Date(dept.completedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
    : null;
  const timeAgo = caseData.createdAt
    ? new Date(caseData.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
    : "-";

  const actionStatus = Reflect.get(Reflect.get(caseData.departments, departmentName) ?? {}, "actionStatus") || "";
  const isStatusSelected = actionStatus && actionStatus !== ACCEPT_STATUS;

  const {
    isUpdating,
    isSyncing,
    handleAccept,
    handleStatusChange,
    handleComplete,
    handleCancel,
    handleToggleUrgency,
  } = useConsultActions(caseId, departmentName, hn, onUpdate);

  const handleToggleUrgencyClick = useCallback(() => {
    if (isUpdating) return;
    setShowUrgencyConfirm(true);
  }, [isUpdating]);

  const confirmToggleUrgency = useCallback(async () => {
    setShowUrgencyConfirm(false);
    await handleToggleUrgency(isUrgent);
  }, [isUrgent, handleToggleUrgency]);

  const handleAcceptCase = useCallback(async () => {
    const success = await handleAccept();
    if (success) {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          setFlashSuccess(true);
        });
      } else {
        setFlashSuccess(true);
      }
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
        className={`transition-colors duration-200 rounded-[10px] p-3 animate-stagger-in relative bg-paper border border-rule border-l-4 ${
          isRoomMenuOpen ? "z-30" : ""
        } has-[[role=listbox]]:z-30 ${
          flashSuccess ? "animate-success-flash" : ""
        } ${
          isUrgent ? "border-l-bad" : "border-l-ok"
        }`}
        style={{ animationDelay: `${animationDelay}ms` }}
      >
        {!isTerminal && (
          <button
            type="button"
            aria-label="ยกเลิกปรึกษา"
            onClick={() => setShowCancelConfirm(true)}
            disabled={isUpdating}
            className={`absolute top-2 right-2 w-6 h-6 rounded-[4px] flex items-center justify-center transition-colors duration-200 z-10 ${
              isUpdating
                ? "bg-paper-3 text-muted cursor-not-allowed"
                : "bg-paper-3 text-muted hover:bg-bad hover:text-paper border border-rule"
            }`}
            title="ยกเลิกปรึกษา"
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="flex items-start gap-2.5 min-w-0 pr-7 mb-1.5">
          <button
            type="button"
            onClick={handleToggleUrgencyClick}
            disabled={isUpdating}
            title={isUrgent ? "เปลี่ยนเป็นเคสปกติ" : "เปลี่ยนเป็นเคส FAST TRACK"}
            aria-label={isUrgent ? "เปลี่ยนเป็นเคสปกติ" : "เปลี่ยนเป็นเคส FAST TRACK"}
            className={`w-8 h-8 shrink-0 rounded-[6px] flex items-center justify-center transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isUrgent ? "bg-bad text-paper" : "bg-ok text-paper"
            }`}
          >
            {isUrgent ? (
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-0.5">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <h3 className="text-base font-medium measured text-ink break-all">
                  {"HN: "}
                  {hn}
                </h3>
                {isUrgent && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium bg-bad text-paper shrink-0">
                    FAST
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isSyncing && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-cool font-medium whitespace-nowrap">
                    <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Syncing…
                  </span>
                )}
                {isTerminal && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium bg-ok-soft text-ok border border-ok/30">
                    <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
                {!isTerminal && caseData.createdAt && (
                  <ElapsedTime createdAt={caseData.createdAt} />
                )}
              </div>
            </div>
            {fullName && (
              <p className="text-xs font-medium text-ink-2 break-words">
                {fullName}
              </p>
            )}
          </div>
        </div>

        <div className="mb-2 min-w-0">
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="font-medium text-ink whitespace-nowrap">{departmentName}</span>
            <svg aria-hidden="true" className="w-3 h-3 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] font-medium text-[11px] border whitespace-nowrap ${
              isResusRoom
                ? "bg-bad-soft text-bad border-bad/30"
                : "bg-ok-soft text-ok border-ok/30"
            }`}>
              <svg aria-hidden="true" focusable="false" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {room ?? "-"}
            </span>
            <RoomTransferButton 
              consultId={caseId}
              currentRoom={room}
              darkMode={darkMode}
              onOpenChange={setIsRoomMenuOpen}
              disabled={isUpdating}
            />
          </div>
          {Object.keys(caseData.departments).filter(
            (d) => d !== departmentName && Reflect.get(caseData.departments[d as keyof typeof caseData.departments] ?? {}, "status") === "pending"
          ).length > 0 && (
            <div className="flex items-baseline gap-1 text-xs mt-1 min-w-0 flex-wrap">
              <span className="text-muted whitespace-nowrap">{"แผนกอื่น:"}</span>
              <span className="font-medium underline text-ink-2 break-words">
                {Object.keys(caseData.departments)
                  .filter((d) => d !== departmentName && Reflect.get(caseData.departments[d as keyof typeof caseData.departments] ?? {}, "status") === "pending")
                  .join(", ")}
              </span>
            </div>
          )}
        </div>

        <div className="mb-2.5 p-2.5 rounded-[6px] border border-rule bg-paper-3 min-w-0">
          <p className="text-xs font-medium mb-0.5 text-muted">Dx:</p>
          <p className="text-sm leading-snug whitespace-pre-wrap break-words text-ink">{problem}</p>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-muted measured">
              <svg aria-hidden="true" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{timeAgo}</span>
            </div>
            {isTerminal && (
              <div className="flex items-center gap-1 text-ink-2 measured">
                <svg aria-hidden="true" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{dept?.status === "cancelled" ? "ยกเลิก" : "ปิด"}: {completedTime}</span>
              </div>
            )}
            {(() => {
              const allMilestones = getMilestones(dept, formatTime);
              const milestonesToRender = isAccepted 
                ? allMilestones 
                : allMilestones.filter(m => m.icon === "transfer");
                
              if (milestonesToRender.length === 0) return null;

              const getMilestoneTone = (label: string) => {
                if (label === "รับ") return "text-ok";
                if (label === "คืน ER") return "text-accent";
                return "text-cool";
              };

              return (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] measured">
                  {milestonesToRender.map((m, idx, arr) => (
                    <React.Fragment key={`${m.label}-${m.raw}`}>
                      <div className="flex items-center gap-1">
                        {m.icon === "check" ? (
                          <svg aria-hidden="true" className="w-3 h-3 text-ok shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : m.icon === "transfer" ? (
                          <svg aria-hidden="true" className="w-3 h-3 text-cool shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : null}
                        <span className={`font-medium whitespace-nowrap ${getMilestoneTone(m.label)}`}>{m.label} {m.time}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <svg aria-hidden="true" className="w-3 h-3 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </div>

          {!isTerminal && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-rule">
              {isAccepted && !isStatusSelected && !isUpdating && (
                <div className="text-[11px] font-medium text-center text-accent">
                  กรุณาเลือกสถานะก่อนปิดเคส
                </div>
              )}
              <div className="flex gap-2">
                {!isAccepted ? (
                  <>
                  <button
                    type="button"
                    onClick={handleAcceptCase}
                    disabled={isUpdating}
                    className={`flex-1 px-3 py-1.5 rounded-[6px] font-medium text-xs transition-colors duration-200 flex items-center justify-center gap-1 tap-feedback whitespace-nowrap ${
                      isUpdating
                        ? "bg-paper-3 text-muted cursor-not-allowed border border-rule"
                        : "bg-ok text-paper hover:opacity-90"
                    }`}
                  >
                    {isUpdating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        <span>กำลังรับ…</span>
                      </>
                    ) : (
                      <>
                        <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>รับเคส</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex-1 px-3 py-1.5 rounded-[6px] font-medium text-xs cursor-not-allowed flex items-center justify-center gap-1 bg-paper-3 border border-dashed border-rule-2 text-muted whitespace-nowrap"
                  >
                    <svg aria-hidden="true" className="w-3 h-3 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>ปิดเคส</span>
                  </button>
                </>
              ) : (
                <>
                  <div className={`flex-1 min-w-0 relative ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}>
                    <select
                      aria-label="เลือกสถานะถัดไป"
                      value={actionStatus && actionStatus !== ACCEPT_STATUS ? actionStatus : ""}
                      onChange={(e) => handleStatusChange(e.target.value as PostAcceptStatus)}
                      className={`w-full h-full pl-2 pr-7 py-1.5 rounded-[6px] font-medium text-xs transition-colors duration-200 appearance-none text-center cursor-pointer border ${
                        actionStatus && actionStatus !== ACCEPT_STATUS
                          ? "bg-accent-soft text-accent border-accent"
                          : "bg-paper-3 text-ink border-rule-2"
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
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-accent">
                      <svg aria-hidden="true" className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    disabled={isUpdating || !isStatusSelected}
                    className={`flex-1 px-3 py-1.5 rounded-[6px] font-medium text-xs transition-colors duration-200 flex items-center justify-center gap-1 tap-feedback whitespace-nowrap ${
                      isUpdating || !isStatusSelected
                        ? "bg-paper-3 text-muted cursor-not-allowed border border-dashed border-rule-2"
                        : "bg-bad text-paper hover:opacity-90"
                    }`}
                  >
                    {isUpdating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        <span>กำลังปิด…</span>
                      </>
                    ) : (
                      <>
                        <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      <ConfirmModal
        isOpen={showUrgencyConfirm}
        title={isUrgent ? "ยกเลิก FAST TRACK" : "เปลี่ยนเป็น FAST TRACK"}
        message={`คุณต้องการเปลี่ยนเคส HN: ${hn} ${isUrgent ? "กลับเป็นเคสปกติ" : "เป็นเคส FAST TRACK (ด่วน)"} หรือไม่?`}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        variant={isUrgent ? "warning" : "danger"}
        onConfirm={confirmToggleUrgency}
        onCancel={() => setShowUrgencyConfirm(false)}
      />
    </>
  );
}

export default React.memo(ConsultCard);