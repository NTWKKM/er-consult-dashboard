"use client";

import { useState, useCallback, useRef } from "react";
import { updateConsult, transactionalUpdateConsult, type UpdateResults } from "@/lib/db";
import { acquireCaseLock, releaseCaseLock, useCaseLocked } from "@/lib/caseLock";
import { SURGERY_DEPTS, ORTHO_DEPTS, ACCEPT_STATUS, POST_ACCEPT_STATUSES } from "@/lib/constants";
import { useToast } from "../contexts/ToastContext";

export type PostAcceptStatus = (typeof POST_ACCEPT_STATUSES)[number];

/**
 * Custom hook to manage consult actions (accept, status change, complete, cancel).
 * Centralizes business logic and handles visual sync states.
 */
export function useConsultActions(caseId: string, departmentName: string, hn: string, onUpdate?: () => void) {
  const [isLocalUpdating, setIsLocalUpdating] = useState(false);
  const isCaseBusy = useCaseLocked(caseId);
  const isUpdating = isLocalUpdating || isCaseBusy;
  const [isSyncing, setIsSyncing] = useState(false);
  const inFlightRef = useRef(false);
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

  /**
   * Shared action runner that manages per-case in-flight locking, background sync tracking, and toast feedback.
   * When `holdLockUntilRemote` is true (transactional writes), the UI lock stays held until
   * `backgroundPromise` settles to prevent concurrent duplicate transactions across departments.
   * When false (offline-queued writes), the lock releases immediately so offline ER edits never deadlock.
   */
  const executeAction = useCallback(
    async ({
      run,
      holdLockUntilRemote,
      getSuccessMessage,
      errorMessage,
      errorLogLabel,
      onNotApplied,
    }: {
      run: (markBackgroundFailed: () => void) => Promise<UpdateResults>;
      holdLockUntilRemote: boolean;
      getSuccessMessage: () => string;
      errorMessage: string;
      errorLogLabel: string;
      onNotApplied?: () => void;
    }): Promise<boolean> => {
      if (inFlightRef.current || !acquireCaseLock(caseId)) return false;
      inFlightRef.current = true;
      setIsLocalUpdating(true);
      beginSync();

      const releaseLocks = () => {
        setIsLocalUpdating(false);
        inFlightRef.current = false;
        releaseCaseLock(caseId);
      };

      let backgroundFailed = false;
      const markBackgroundFailed = () => {
        backgroundFailed = true;
      };

      let result: UpdateResults;
      try {
        result = await run(markBackgroundFailed);
      } catch (error) {
        console.error(errorLogLabel, error);
        addToast({ type: "error", message: errorMessage });
        endSync();
        releaseLocks();
        return false;
      }

      if (!result.applied) {
        endSync();
        releaseLocks();
        if (onNotApplied) {
          onNotApplied();
        } else {
          addToast({
            type: "warning",
            message: "เคสนี้ถูกอัปเดตโดยผู้ใช้อื่นแล้ว ระบบกำลังรีเฟรชข้อมูล",
          });
        }
        return false;
      }

      const emitSuccessToast = () => {
        try {
          addToast({ type: "success", message: getSuccessMessage() });
        } catch (error) {
          console.error(errorLogLabel, error);
        }
      };

      if (holdLockUntilRemote) {
        if (result.backgroundPromise) {
          // Hold transactional lock until server transaction settles to prevent concurrent duplicate writes
          // and show final success toast only after the remote commit is confirmed.
          const release = () => {
            endSync();
            releaseLocks();
          };
          void result.backgroundPromise.then(
            () => {
              release();
              if (!backgroundFailed) {
                emitSuccessToast();
              }
            },
            () => {
              release();
            }
          );
        } else {
          endSync();
          releaseLocks();
          emitSuccessToast();
        }
      } else {
        if (result.backgroundPromise) {
          void result.backgroundPromise.then(
            () => endSync(),
            () => endSync()
          );
        } else {
          endSync();
        }
        releaseLocks();
        emitSuccessToast();
      }

      try {
        onUpdate?.();
      } catch (error) {
        console.error(errorLogLabel, error);
      }

      return true;
    },
    [caseId, addToast, onUpdate, beginSync, endSync]
  );

  const handleAccept = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      addToast({
        type: "error",
        message: "ไม่สามารถรับเคสขณะออฟไลน์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
      });
      return false;
    }

    return executeAction({
      holdLockUntilRemote: true,
      errorLogLabel: "Error accepting case:",
      errorMessage: "เกิดข้อผิดพลาดในการรับเคส",
      getSuccessMessage: () => `รับเคส HN: ${hn} สำเร็จ`,
      run: (markBackgroundFailed) =>
        transactionalUpdateConsult(caseId, (current) => {
          // Guard against stale snapshots or missing departments
          if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
            return null;
          }

          const isSurgeryDept = (SURGERY_DEPTS as readonly string[]).includes(departmentName);
          const isOrthoDept = (ORTHO_DEPTS as readonly string[]).includes(departmentName);
          const targetDepts = isSurgeryDept
            ? SURGERY_DEPTS
            : isOrthoDept
              ? ORTHO_DEPTS
              : [departmentName];
          const now = new Date().toISOString();

          const updates: Record<string, string | null> = {};
          Object.keys(current.departments).forEach((dept) => {
            if (
              (targetDepts as readonly string[]).includes(dept) &&
              current.departments[dept].status === "pending" &&
              !current.departments[dept].acceptedAt
            ) {
              updates[`departments.${dept}.acceptedAt`] = now;
              updates[`departments.${dept}.actionStatus`] = ACCEPT_STATUS;
            }
          });

          return Object.keys(updates).length > 0 ? updates : null;
        }, {
          awaitRemote: false,
          onBackgroundError: (error: unknown) => {
            markBackgroundFailed();
            const errorMessage = error instanceof Error ? error.message : "";

            if (errorMessage === "TRANSACTION_CONDITION_NOT_MET") {
              // Case was already accepted by another physician
              addToast({
                type: "warning",
                message: "เคสนี้ถูกรับโดยแพทย์ท่านอื่นแล้ว ระบบกำลังรีเฟรชข้อมูล",
              });
            } else {
              // Network / Firestore connectivity error
              addToast({
                type: "error",
                message: "เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่อีกครั้ง",
              });
            }
          },
        }),
    });
  }, [caseId, departmentName, hn, addToast, executeAction]);

  const handleStatusChange = useCallback(async (newStatus: PostAcceptStatus) => {
    await executeAction({
      holdLockUntilRemote: false,
      errorLogLabel: "Error updating status:",
      errorMessage: "เกิดข้อผิดพลาดในการอัปเดตสถานะ",
      getSuccessMessage: () => `อัปเดตสถานะเป็น "${newStatus}" สำเร็จ`,
      run: () =>
        updateConsult(caseId, (current) => {
          if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
            return null;
          }

          const now = new Date().toISOString();
          const updates: Record<string, string | null> = {
            [`departments.${departmentName}.actionStatus`]: newStatus,
          };

          // Only write the timestamp for the selected status.
          // Preserve sibling timestamps for full audit trail.
          if (newStatus === "Admit") {
            updates[`departments.${departmentName}.admittedAt`] = now;
          } else if (newStatus === "คืน ER") {
            updates[`departments.${departmentName}.returnedAt`] = now;
          } else if (newStatus === "D/C") {
            updates[`departments.${departmentName}.dischargedAt`] = now;
          }

          if (!current.departments[departmentName].acceptedAt) {
            updates[`departments.${departmentName}.acceptedAt`] = now;
          }

          return updates;
        }, {
          awaitRemote: false,
          onBackgroundError: () => {
            addToast({
              type: "error",
              message: "อัปเดตสถานะไม่สำเร็จ: เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่อีกครั้ง",
            });
          },
        }),
    });
  }, [caseId, departmentName, addToast, executeAction]);

  const handleTerminalTransition = useCallback(
    async (
      terminalStatus: "completed" | "cancelled",
      successMessage: string,
      errorMessage: string,
      errorLogLabel: string
    ) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        addToast({
          type: "error",
          message: "ไม่สามารถทำรายการนี้ขณะออฟไลน์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
        });
        return;
      }

      await executeAction({
        holdLockUntilRemote: true,
        errorLogLabel,
        errorMessage,
        getSuccessMessage: () => successMessage,
        run: (markBackgroundFailed) =>
          transactionalUpdateConsult(caseId, (current) => {
            if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
              return null;
            }

            const now = new Date().toISOString();
            const updates: Record<string, string | null> = {
              [`departments.${departmentName}.status`]: terminalStatus,
              [`departments.${departmentName}.completedAt`]: now,
            };

            const allFinished = Object.keys(current.departments).every((deptKey) => {
              if (deptKey === departmentName) return true;
              const d = current.departments[deptKey];
              return d.status === "completed" || d.status === "cancelled";
            });

            return {
              ...updates,
              ...(allFinished && { status: "completed" as const }),
            };
          }, {
            awaitRemote: false,
            onBackgroundError: (error: unknown) => {
              markBackgroundFailed();
              const errorMsg = error instanceof Error ? error.message : "";
              if (errorMsg === "TRANSACTION_CONDITION_NOT_MET") {
                addToast({
                  type: "warning",
                  message: "เคสนี้ถูกแก้ไขโดยแพทย์ท่านอื่นแล้ว ระบบกำลังรีเฟรชข้อมูล",
                });
              } else {
                addToast({
                  type: "error",
                  message: "เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่อีกครั้ง",
                });
              }
            },
          }),
      });
    },
    [caseId, departmentName, addToast, executeAction]
  );

  const handleComplete = useCallback(async () => {
    await handleTerminalTransition(
      "completed",
      `ปิดเคส HN: ${hn} (${departmentName}) สำเร็จ`,
      "เกิดข้อผิดพลาดในการปิดเคส",
      "Error updating case:"
    );
  }, [handleTerminalTransition, hn, departmentName]);

  const handleCancel = useCallback(async () => {
    await handleTerminalTransition(
      "cancelled",
      `ยกเลิกปรึกษา HN: ${hn} (${departmentName}) สำเร็จ`,
      "เกิดข้อผิดพลาดในการยกเลิกปรึกษา",
      "Error cancelling consult:"
    );
  }, [handleTerminalTransition, hn, departmentName]);

  const handleToggleUrgency = useCallback(async (currentUrgent: boolean): Promise<boolean> => {
    const targetUrgent = !currentUrgent;
    return executeAction({
      holdLockUntilRemote: false,
      errorLogLabel: "Error toggling urgency:",
      errorMessage: "เกิดข้อผิดพลาดในการเปลี่ยนสถานะความเร่งด่วน",
      getSuccessMessage: () =>
        targetUrgent
          ? "เปลี่ยนเป็นเคส FAST TRACK สำเร็จ"
          : "เปลี่ยนเป็นเคสปกติสำเร็จ",
      onNotApplied: () => {
        addToast({
          type: "info",
          message: targetUrgent
            ? "เคสนี้เป็น FAST TRACK อยู่แล้ว"
            : "เคสนี้เป็นเคสปกติอยู่แล้ว",
        });
      },
      run: () =>
        updateConsult(caseId, (current) => {
          // Idempotent target: avoid flipping back if another clinician already applied the intended urgency
          if (current.isUrgent === targetUrgent) {
            return null;
          }
          return {
            isUrgent: targetUrgent,
          };
        }, {
          awaitRemote: false,
          onBackgroundError: () => {
            addToast({
              type: "error",
              message: "อัปเดตสถานะความเร่งด่วนไม่สำเร็จ: เกิดข้อผิดพลาดในระบบหลังบ้าน",
            });
          },
        }),
    });
  }, [caseId, addToast, executeAction]);

  return { isUpdating, isSyncing, handleAccept, handleStatusChange, handleComplete, handleCancel, handleToggleUrgency };
}

