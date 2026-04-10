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
    if (isUpdating) return false;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        // Guard against stale snapshots or missing departments
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const updatedDepartments = { ...current.departments };
        const isSurgeryDept = (SURGERY_DEPTS as readonly string[]).includes(departmentName);
        const targetDepts = isSurgeryDept ? SURGERY_DEPTS : ORTHO_DEPTS;
        const now = new Date().toISOString();

        // Multi-department accept logic for specific specialties
        Object.keys(updatedDepartments).forEach((dept) => {
          if ((targetDepts as readonly string[]).includes(dept) && updatedDepartments[dept].status === "pending") {
            updatedDepartments[dept] = {
              ...updatedDepartments[dept],
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
      return true;
    } catch (error) {
      console.error("Error accepting case:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการรับเคส" });
      setIsUpdating(false);
      endSync();
      return false;
    }
  }, [caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync, isUpdating]);

  const handleStatusChange = useCallback(async (newStatus: PostAcceptStatus) => {
    if (isUpdating) return;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
        if (!current.departments || !current.departments[departmentName] || current.departments[departmentName].status !== "pending") {
          return null;
        }

        const updatedDepartments = { ...current.departments };
        const now = new Date().toISOString();

        const nextDept = {
          ...updatedDepartments[departmentName],
          acceptedAt: updatedDepartments[departmentName].acceptedAt || now,
          actionStatus: newStatus,
        };

        delete nextDept.admittedAt;
        delete nextDept.returnedAt;
        delete nextDept.dischargedAt;

        if (newStatus === "Admit") {
          nextDept.admittedAt = now;
        } else if (newStatus === "คืน ER") {
          nextDept.returnedAt = now;
        } else if (newStatus === "D/C") {
          nextDept.dischargedAt = now;
        }

        updatedDepartments[departmentName] = nextDept;

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
    } catch (error) {
      console.error("Error updating status:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
      setIsUpdating(false);
      endSync();
    }
  }, [caseId, departmentName, addToast, onUpdate, beginSync, endSync, isUpdating]);

  const handleComplete = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
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
    } catch (error) {
      console.error("Error updating case:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการปิดเคส" });
      setIsUpdating(false);
      endSync();
    }
  }, [caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync, isUpdating]);

  const handleCancel = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    beginSync();
    try {
      const result = await updateConsult(caseId, (current) => {
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
    } catch (error) {
      console.error("Error cancelling consult:", error);
      addToast({ type: "error", message: "เกิดข้อผิดพลาดในการยกเลิกปรึกษา" });
      setIsUpdating(false);
      endSync();
    }
  }, [caseId, departmentName, hn, addToast, onUpdate, beginSync, endSync, isUpdating]);

  return { isUpdating, isSyncing, handleAccept, handleStatusChange, handleComplete, handleCancel };
}
