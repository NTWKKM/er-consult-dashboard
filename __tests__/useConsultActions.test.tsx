import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ToastProvider, useToast } from "@/app/contexts/ToastContext";
import { ACCEPT_STATUS, SURGERY_DEPTS, ORTHO_DEPTS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Mock lib/db BEFORE importing the hook
// ---------------------------------------------------------------------------
const { mockUpdateConsult, mockTransactionalUpdateConsult } = vi.hoisted(() => ({
  mockUpdateConsult: vi.fn(),
  mockTransactionalUpdateConsult: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  updateConsult: mockUpdateConsult,
  transactionalUpdateConsult: mockTransactionalUpdateConsult,
}));

import { useConsultActions } from "@/app/hooks/useConsultActions";
import type { Consult } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

type UpdaterFn = (current: Consult) => Partial<Omit<Consult, "id">> | null;

/**
 * Captures the updater function that was passed to updateConsult or transactionalUpdateConsult,
 * and calls it with the given consult snapshot.
 */
function captureAndRunUpdater(snapshot: Consult, mock: ReturnType<typeof vi.fn> = mockUpdateConsult): Partial<Omit<Consult, "id">> | null {
  const call = mock.mock.calls[0];
  const updaterFn: UpdaterFn = call[1];
  return updaterFn(snapshot);
}

function makePendingConsult(overrides: Partial<Consult> = {}): Consult {
  return {
    id: "consult-1",
    hn: "123456",
    firstName: "John",
    lastName: "Doe",
    room: "NT",
    problem: "Chest pain",
    isUrgent: false,
    status: "pending",
    createdAt: new Date().toISOString(),
    departments: {
      "Gen Sx": {
        status: "pending",
        acceptedAt: undefined,
        actionStatus: undefined,
        admittedAt: undefined,
        returnedAt: undefined,
        dischargedAt: undefined,
        completedAt: undefined,
        transfers: [],
      },
    },
    ...overrides,
  } as unknown as Consult;
}

function makeSuccessResult(consult: Consult | null = makePendingConsult()) {
  return {
    consult,
    isQueued: false,
    backgroundPromise: null,
    applied: true,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useConsultActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  describe("initial state", () => {
    it("returns isUpdating=false initially", () => {
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );
      expect(result.current.isUpdating).toBe(false);
    });

    it("returns isSyncing=false initially", () => {
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );
      expect(result.current.isSyncing).toBe(false);
    });

    it("exposes handleAccept, handleStatusChange, handleComplete, handleCancel", () => {
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );
      expect(typeof result.current.handleAccept).toBe("function");
      expect(typeof result.current.handleStatusChange).toBe("function");
      expect(typeof result.current.handleComplete).toBe("function");
      expect(typeof result.current.handleCancel).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // handleAccept
  // -------------------------------------------------------------------------
  describe("handleAccept", () => {
    it("calls transactionalUpdateConsult with the correct caseId", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("my-case-id", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      expect(mockTransactionalUpdateConsult).toHaveBeenCalledWith(
        "my-case-id",
        expect.any(Function),
        expect.any(Object)
      );
    });

    it("sets isUpdating=true while updating, then false after", async () => {
      let resolveUpdate!: (v: ReturnType<typeof makeSuccessResult>) => void;
      mockTransactionalUpdateConsult.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
      );

      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      let promise!: Promise<boolean>;
      act(() => {
        promise = result.current.handleAccept();
      });

      // isUpdating should be true while the promise is pending
      expect(result.current.isUpdating).toBe(true);

      await act(async () => {
        resolveUpdate(makeSuccessResult());
        await promise;
      });

      expect(result.current.isUpdating).toBe(false);
    });

    it("updater returns null when dept status is not pending", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "completed" } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      expect(updated).toBeNull();
    });

    it("updater sets ACCEPT_STATUS on the surgery department", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const deptName = "Gen Sx" as (typeof SURGERY_DEPTS)[number];
      const { result } = renderHook(
        () => useConsultActions("consult-1", deptName, "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      const snapshot = makePendingConsult({
        departments: {
          [deptName]: { status: "pending", acceptedAt: undefined } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult) as Record<string, unknown> | null;
      expect(updated).not.toBeNull();
      expect(updated![`departments.${deptName}.actionStatus`]).toBe(ACCEPT_STATUS);
    });

    it("updater sets ACCEPT_STATUS on the ortho department", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const deptName = "Ortho" as (typeof ORTHO_DEPTS)[number];
      const { result } = renderHook(
        () => useConsultActions("consult-1", deptName, "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      const snapshot = makePendingConsult({
        departments: {
          [deptName]: { status: "pending", acceptedAt: undefined } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult) as Record<string, unknown> | null;
      expect(updated).not.toBeNull();
      expect(updated![`departments.${deptName}.actionStatus`]).toBe(ACCEPT_STATUS);
    });

    it("skips already-accepted departments and returns null when no unaccepted target departments remain", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      const existingAcceptedAt = "2024-01-15T08:00:00.000Z";
      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": {
            status: "pending",
            acceptedAt: existingAcceptedAt,
            actionStatus: "Admit",
          } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      expect(updated).toBeNull();
    });

    it("skips already-accepted departments while accepting unaccepted pending siblings in the same group", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      const existingAcceptedAt = "2024-01-15T08:00:00.000Z";
      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": {
            status: "pending",
            acceptedAt: existingAcceptedAt,
            actionStatus: "Admit",
          } as never,
          "Neuro Sx": {
            status: "pending",
            completedAt: null,
          } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult) as Record<string, unknown> | null;
      expect(updated).not.toBeNull();
      expect(updated!["departments.Gen Sx.acceptedAt"]).toBeUndefined();
      expect(updated!["departments.Gen Sx.actionStatus"]).toBeUndefined();
      expect(updated!["departments.Neuro Sx.acceptedAt"]).toEqual(expect.any(String));
      expect(updated!["departments.Neuro Sx.actionStatus"]).toBe(ACCEPT_STATUS);
    });

    it("returns early and does not call transactionalUpdateConsult when already updating", async () => {
      let resolveFirst!: (v: ReturnType<typeof makeSuccessResult>) => void;
      mockTransactionalUpdateConsult.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      );

      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      // Start first call (will hang)
      act(() => {
        result.current.handleAccept();
      });

      // Try second call while first is still in progress
      await act(async () => {
        await result.current.handleAccept();
      });

      // transactionalUpdateConsult should only be called once
      expect(mockTransactionalUpdateConsult).toHaveBeenCalledTimes(1);

      // Clean up
      await act(async () => {
        resolveFirst(makeSuccessResult());
      });
    });

    it("calls onUpdate callback after successful accept", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const onUpdate = vi.fn();
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456", onUpdate),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      expect(onUpdate).toHaveBeenCalledOnce();
    });

    it("handles error gracefully and resets isUpdating", async () => {
      mockTransactionalUpdateConsult.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      expect(result.current.isUpdating).toBe(false);
    });

    it("returns early without calling onUpdate when updater returns null and not queued", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue({
        consult: null,
        isQueued: false,
        backgroundPromise: null,
        applied: false,
      });
      const onUpdate = vi.fn();
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456", onUpdate),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleStatusChange
  // -------------------------------------------------------------------------
  describe("handleStatusChange", () => {
    it("calls updateConsult with the correct caseId", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("Admit");
      });

      expect(mockUpdateConsult).toHaveBeenCalledWith(
        "consult-1",
        expect.any(Function),
        expect.any(Object)
      );
    });

    it("updater sets admittedAt when status is Admit", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("Admit");
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot) as Record<string, unknown> | null;
      expect(updated).not.toBeNull();
      expect(updated![`departments.Gen Sx.admittedAt`]).toBeDefined();
      expect(Object.hasOwn(updated!, "departments.Gen Sx.returnedAt")).toBe(false);
      expect(Object.hasOwn(updated!, "departments.Gen Sx.dischargedAt")).toBe(false);
    });

    it("updater sets returnedAt when status is คืน ER", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("คืน ER");
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot) as Record<string, unknown> | null;
      expect(updated![`departments.Gen Sx.returnedAt`]).toBeDefined();
      expect(Object.hasOwn(updated!, "departments.Gen Sx.admittedAt")).toBe(false);
      expect(Object.hasOwn(updated!, "departments.Gen Sx.dischargedAt")).toBe(false);
    });

    it("updater sets dischargedAt when status is D/C", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("D/C");
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot) as Record<string, unknown> | null;
      expect(updated![`departments.Gen Sx.dischargedAt`]).toBeDefined();
      expect(Object.hasOwn(updated!, "departments.Gen Sx.admittedAt")).toBe(false);
      expect(Object.hasOwn(updated!, "departments.Gen Sx.returnedAt")).toBe(false);
    });

    it("preserves previous action timestamps when changing status", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("คืน ER");
      });

      // Snapshot that has admittedAt set (from a previous Admit action)
      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": {
            status: "pending",
            acceptedAt: "2024-01-15T08:00:00.000Z",
            admittedAt: "2024-01-15T09:00:00.000Z",
          } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot) as Record<string, unknown> | null;
      expect(Object.hasOwn(updated!, "departments.Gen Sx.admittedAt")).toBe(false);
      expect(updated![`departments.Gen Sx.returnedAt`]).toBeDefined();
    });

    it("updater returns null when dept is not pending", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("Admit");
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "completed" } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot);
      expect(updated).toBeNull();
    });

    it("calls onUpdate after successful status change", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const onUpdate = vi.fn();
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456", onUpdate),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleStatusChange("Admit");
      });

      expect(onUpdate).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // handleComplete
  // -------------------------------------------------------------------------
  describe("handleComplete", () => {
    it("calls transactionalUpdateConsult", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockTransactionalUpdateConsult).toHaveBeenCalledOnce();
    });

    it("updater sets department status to completed", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult) as Record<string, unknown> | null;
      expect(updated![`departments.Gen Sx.status`]).toBe("completed");
      expect(updated![`departments.Gen Sx.completedAt`]).toBeDefined();
    });

    it("updater promotes overall consult status when all depts are done", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "pending" } as never,
          // All other depts already completed
        },
      });
      // Only one dept (Gen Sx), so completing it means all are done
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      expect(updated!.status).toBe("completed");
    });

    it("updater does NOT set overall status when some depts are still pending", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "pending" } as never,
          "Ortho": { status: "pending" } as never,
        },
      });
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      // Ortho is still pending, so overall status should NOT be "completed"
      expect(updated!.status).toBeUndefined();
    });

    it("updater returns null when dept is not pending", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "completed" } as never,
        },
      });
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      expect(updated).toBeNull();
    });

    it("handles error and resets isUpdating", async () => {
      mockTransactionalUpdateConsult.mockRejectedValueOnce(new Error("db error"));
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      expect(result.current.isUpdating).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // handleCancel
  // -------------------------------------------------------------------------
  describe("handleCancel", () => {
    it("calls transactionalUpdateConsult", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      expect(mockTransactionalUpdateConsult).toHaveBeenCalledOnce();
    });

    it("updater sets department status to cancelled", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult) as Record<string, unknown> | null;
      expect(updated![`departments.Gen Sx.status`]).toBe("cancelled");
      expect(updated![`departments.Gen Sx.completedAt`]).toBeDefined();
    });

    it("updater promotes overall status to completed when all depts are finished (completed or cancelled)", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "pending" } as never,
          "Sx Trauma": { status: "completed" } as never,
        },
      });
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      // Cancelling Gen Sx means Gen Sx=cancelled, Sx Trauma=completed → all done
      expect(updated!.status).toBe("completed");
    });

    it("updater does NOT set overall status when some depts are still pending", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "pending" } as never,
          "Ortho": { status: "pending" } as never,
        },
      });
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      expect(updated!.status).toBeUndefined();
    });

    it("updater returns null when dept is not pending", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      const snapshot = makePendingConsult({
        departments: {
          "Gen Sx": { status: "cancelled" } as never,
        },
      });
      const updated = captureAndRunUpdater(snapshot, mockTransactionalUpdateConsult);
      expect(updated).toBeNull();
    });

    it("calls onUpdate after successful cancel", async () => {
      mockTransactionalUpdateConsult.mockResolvedValue(makeSuccessResult());
      const onUpdate = vi.fn();
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456", onUpdate),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      expect(onUpdate).toHaveBeenCalledOnce();
    });

    it("handles error and resets isUpdating", async () => {
      mockTransactionalUpdateConsult.mockRejectedValueOnce(new Error("cancel failed"));
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      expect(result.current.isUpdating).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Background promise handling
  // -------------------------------------------------------------------------
  describe("background promise handling", () => {
    it("resolves isSyncing=false after backgroundPromise resolves", async () => {
      let resolveBackground!: () => void;
      const backgroundPromise = new Promise<void>((resolve) => {
        resolveBackground = resolve;
      });

      mockTransactionalUpdateConsult.mockResolvedValue({
        consult: makePendingConsult(),
        isQueued: true,
        backgroundPromise,
        applied: true,
      });

      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      // isSyncing should still be true while backgroundPromise is pending
      expect(result.current.isSyncing).toBe(true);
      // Regression B3: transactional lock stays held until backgroundPromise settles
      expect(result.current.isUpdating).toBe(true);

      let secondAttempt = true;
      await act(async () => {
        secondAttempt = await result.current.handleAccept();
      });
      expect(secondAttempt).toBe(false);
      expect(mockTransactionalUpdateConsult).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveBackground();
        await backgroundPromise;
      });

      expect(result.current.isSyncing).toBe(false);
      expect(result.current.isUpdating).toBe(false);
    });

    it("regression B3 (offline safety): offline-queued updateConsult unlocks immediately even while backgroundPromise is pending", async () => {
      // Simulate offline updateDoc whose Promise stays unresolved until reconnect
      const neverResolvingOfflinePromise = new Promise<void>(() => {});
      mockUpdateConsult.mockResolvedValue({
        consult: makePendingConsult({ isUrgent: true }),
        isQueued: true,
        backgroundPromise: neverResolvingOfflinePromise,
        applied: true,
      });

      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      let firstOk = false;
      await act(async () => {
        firstOk = await result.current.handleToggleUrgency(false);
      });
      expect(firstOk).toBe(true);
      expect(result.current.isUpdating).toBe(false);

      // Must NOT deadlock offline — a subsequent offline toggle succeeds immediately
      let secondOk = false;
      await act(async () => {
        secondOk = await result.current.handleToggleUrgency(true);
      });
      expect(secondOk).toBe(true);
      expect(mockUpdateConsult).toHaveBeenCalledTimes(2);
    });

    it("keeps transactional lock and sync state intact when onUpdate throws after run succeeds", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let resolveBackground!: () => void;
      const backgroundPromise = new Promise<void>((resolve) => {
        resolveBackground = resolve;
      });

      mockTransactionalUpdateConsult.mockResolvedValue({
        consult: makePendingConsult(),
        isQueued: true,
        backgroundPromise,
        applied: true,
      });

      const onUpdate = vi.fn(() => {
        throw new Error("onUpdate callback error");
      });

      const { result } = renderHook(
        () => ({
          actions: useConsultActions("consult-1", "Gen Sx", "123456", onUpdate),
          toast: useToast(),
        }),
        { wrapper }
      );

      let ok = false;
      await act(async () => {
        ok = await result.current.actions.handleAccept();
      });

      expect(ok).toBe(true);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error accepting case:", expect.any(Error));
      expect(result.current.actions.isUpdating).toBe(true);
      expect(result.current.actions.isSyncing).toBe(true);
      expect(result.current.toast.toasts.some((t) => t.type === "error")).toBe(false);

      let secondAttempt = true;
      await act(async () => {
        secondAttempt = await result.current.actions.handleAccept();
      });
      expect(secondAttempt).toBe(false);

      await act(async () => {
        resolveBackground();
        await backgroundPromise;
      });

      expect(result.current.actions.isUpdating).toBe(false);
      expect(result.current.actions.isSyncing).toBe(false);
      consoleErrorSpy.mockRestore();
    });

    it("preserves pending sync counter on offline updates when onUpdate throws", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let resolveBackground!: () => void;
      const backgroundPromise = new Promise<void>((resolve) => {
        resolveBackground = resolve;
      });

      mockUpdateConsult.mockResolvedValue({
        consult: makePendingConsult({ isUrgent: true }),
        isQueued: true,
        backgroundPromise,
        applied: true,
      });

      const onUpdate = vi.fn(() => {
        throw new Error("onUpdate callback error");
      });

      const { result } = renderHook(
        () => ({
          actions: useConsultActions("consult-1", "Gen Sx", "123456", onUpdate),
          toast: useToast(),
        }),
        { wrapper }
      );

      let ok = false;
      await act(async () => {
        ok = await result.current.actions.handleToggleUrgency(false);
      });

      expect(ok).toBe(true);
      expect(result.current.actions.isUpdating).toBe(false);
      expect(result.current.actions.isSyncing).toBe(true);
      expect(result.current.toast.toasts.some((t) => t.type === "error")).toBe(false);

      await act(async () => {
        resolveBackground();
        await backgroundPromise;
      });

      expect(result.current.actions.isSyncing).toBe(false);
      consoleErrorSpy.mockRestore();
    });

    it("defers accept and terminal success toasts until server commit confirms without background errors", async () => {
      let resolveBackground!: () => void;
      const backgroundPromise = new Promise<void>((resolve) => {
        resolveBackground = resolve;
      });

      mockTransactionalUpdateConsult.mockResolvedValueOnce({
        consult: makePendingConsult(),
        isQueued: true,
        backgroundPromise,
        applied: true,
      });

      const { result } = renderHook(
        () => ({
          actions: useConsultActions("consult-1", "Gen Sx", "123456"),
          toast: useToast(),
        }),
        { wrapper }
      );

      await act(async () => {
        await result.current.actions.handleAccept();
      });

      // Toast must NOT appear while background transaction is still pending
      expect(result.current.toast.toasts.some((t) => t.type === "success")).toBe(false);

      await act(async () => {
        resolveBackground();
        await backgroundPromise;
      });

      expect(result.current.toast.toasts.some((t) => t.type === "success")).toBe(true);
    });

    it("suppresses success toast when transactional onBackgroundError fires before backgroundPromise resolves", async () => {
      let resolveBackground!: () => void;
      const backgroundPromise = new Promise<void>((resolve) => {
        resolveBackground = resolve;
      });
      let capturedOnBgError: ((err: unknown) => void) | undefined;

      mockTransactionalUpdateConsult.mockImplementationOnce(async (_id, _updater, opts) => {
        capturedOnBgError = opts?.onBackgroundError;
        return {
          consult: makePendingConsult(),
          isQueued: true,
          backgroundPromise,
          applied: true,
        };
      });

      const { result } = renderHook(
        () => ({
          actions: useConsultActions("consult-1", "Gen Sx", "123456"),
          toast: useToast(),
        }),
        { wrapper }
      );

      await act(async () => {
        await result.current.actions.handleComplete();
      });

      expect(result.current.toast.toasts.some((t) => t.type === "success")).toBe(false);

      await act(async () => {
        capturedOnBgError?.(new Error("TRANSACTION_CONDITION_NOT_MET"));
        resolveBackground();
        await backgroundPromise;
      });

      expect(result.current.toast.toasts.some((t) => t.type === "success")).toBe(false);
      expect(result.current.toast.toasts.some((t) => t.type === "warning")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // handleToggleUrgency
  // -------------------------------------------------------------------------
  describe("handleToggleUrgency", () => {
    it("calls updateConsult with the correct caseId and toggles isUrgent", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleToggleUrgency(false);
      });

      expect(mockUpdateConsult).toHaveBeenCalledWith(
        "consult-1",
        expect.any(Function),
        expect.any(Object)
      );

      const snapshot = makePendingConsult({ isUrgent: false });
      const updated = captureAndRunUpdater(snapshot) as Record<string, unknown> | null;
      expect(updated).not.toBeNull();
      expect(updated!.isUrgent).toBe(true);
    });

    it("toggles true to false", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleToggleUrgency(true);
      });

      const snapshot = makePendingConsult({ isUrgent: true });
      const updated = captureAndRunUpdater(snapshot) as Record<string, unknown> | null;
      expect(updated!.isUrgent).toBe(false);
    });
  });
});