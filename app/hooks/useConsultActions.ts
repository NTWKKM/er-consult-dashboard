"use client";

import { useState, useCallback, useRef } from "react";
import { updateConsult, ConsultDepartment } from "@/lib/db";
import { SURGERY_DEPTS, ORTHO_DEPTS, ACCEPT_STATUS, POST_ACCEPT_STATUSES } from "@/lib/constants";
import { useToast } from "../contexts/ToastContext";

export type PostAcceptStatus = (typeof POST_ACCEPT_STATUSES)[number];

/**
 * Custom hook to manage consult actions (accept, status change, complete, cancel).
 * Centralizes business logic and handles visual sync states.
 */
export function useConsultActions(caseId: string, departmentName: string, hn: string, onUpdate?: () => void) {
  const [isUpdating, setIsUpdating] = useState(false);
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

  const handleAccept = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
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

        const updates: any = {};
        Object.keys(current.departments).forEach((dept) => {
          if ((targetDepts as readonly string[]).includes(dept) && current.departments[dept].status === "pending") {
            if (!current.departments[dept].acceptedAt) {
              updates[`departments.${dept}.acceptedAt`] = now;
            }
            updates[`departments.${dept}.actionStatus`] = ACCEPT_STATUS;
          }
        });

        return Object.keys(updates).length > 0 ? updates : null;
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (!result.applied) {
           endSync();
           setIsUpdating(false);
           inFlightRef.current = false;
           return false;
      }

      setIsUpdating(false);

      if (result.backgroundPromise) {
          void result.backgroundPromise.then(
              () => endSync(),
              () => endSync()
          );
      } else {
          endSync();
      }

      addToast({ type: "success", message: `รับเคส HN: ${hn} สำเร็จ` });
      onUpdate?.();
      inFlightRef.current = false;
      return true;
    } catch (error) {
      console.error("Error accepting case:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการรับเคส" });
      setIsUpdating(false);
      endSync();
      inFlightRef.current = false;
      return false;
    }
  }, [caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync]);

  const handleStatusChange = useCallback(async (newStatus: PostAcceptStatus) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const now = new Date().toISOString();
        const updates: any = {
          [`departments.${departmentName}.actionStatus`]: newStatus,
          [`departments.${departmentName}.admittedAt`]: newStatus === "Admit" ? now : null,
          [`departments.${departmentName}.returnedAt`]: newStatus === "คืน ER" ? now : null,
          [`departments.${departmentName}.dischargedAt`]: newStatus === "D/C" ? now : null,
        };

        if (!current.departments[departmentName].acceptedAt) {
          updates[`departments.${departmentName}.acceptedAt`] = now;
        }

        return updates;
      }, { 
        awaitRemote: false,
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (!result.applied) {
           endSync();
           setIsUpdating(false);
           inFlightRef.current = false;
           return;
      }

      setIsUpdating(false);

      if (result.backgroundPromise) {
          void result.backgroundPromise.then(
              () => endSync(),
              () => endSync()
          );
      } else {
          endSync();
      }
      
      addToast({ type: "success", message: `อัปเดตสถานะเป็น "${newStatus}" สำเร็จ` });
      onUpdate?.();
      inFlightRef.current = false;
    } catch (error) {
      console.error("Error updating status:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
      setIsUpdating(false);
      endSync();
      inFlightRef.current = false;
    }
  }, [caseId, departmentName, addToast, onUpdate, beginSync, endSync]);

  const handleComplete = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const now = new Date().toISOString();
        const updates: any = {
          [`departments.${departmentName}.status`]: "completed",
          [`departments.${departmentName}.completedAt`]: now,
        };

        const allCompleted = Object.keys(current.departments).every((deptKey) => {
          if (deptKey === departmentName) return true;
          const d = current.departments[deptKey];
          return d.status === "completed" || d.status === "cancelled";
        });

        return {
          ...updates,
          ...(allCompleted && { status: "completed" as const }),
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

      if (!result.applied) {
           endSync();
           setIsUpdating(false);
           inFlightRef.current = false;
           return;
      }

      setIsUpdating(false);

      if (result.backgroundPromise) {
          void result.backgroundPromise.then(
              () => endSync(),
              () => endSync()
          );
      } else {
          endSync();
      }

      addToast({ type: "success", message: `ปิดเคส HN: ${hn} (${departmentName}) สำเร็จ` });
      onUpdate?.();
      inFlightRef.current = false;
    } catch (error) {
      console.error("Error updating case:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการปิดเคส" });
      setIsUpdating(false);
      endSync();
      inFlightRef.current = false;
    }
  }, [caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync]);

  const handleCancel = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const now = new Date().toISOString();
        const updates: any = {
          [`departments.${departmentName}.status`]: "cancelled",
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
        onBackgroundError: () => {
          addToast({ 
            type: "error", 
            message: "อัปเดตไม่สำเร็จ: เคสนี้ถูกแก้ไขโดยผู้ใช้อื่นแล้ว ข้อมูลกำลังรีเฟรช" 
          });
        }
      });

      if (!result.applied) {
           endSync();
           setIsUpdating(false);
           inFlightRef.current = false;
           return;
      }

      setIsUpdating(false);

      if (result.backgroundPromise) {
          void result.backgroundPromise.then(
              () => endSync(),
              () => endSync()
          );
      } else {
          endSync();
      }

      addToast({ type: "success", message: `ยกเลิกปรึกษา HN: ${hn} (${departmentName}) สำเร็จ` });
      onUpdate?.();
      inFlightRef.current = false;
    } catch (error) {
      console.error("Error cancelling consult:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการยกเลิกปรึกษา" });
      setIsUpdating(false);
      endSync();
      inFlightRef.current = false;
    }
  }, [caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync]);

  return { isUpdating, isSyncing, handleAccept, handleStatusChange, handleComplete, handleCancel };
}
