import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ToastProvider } from "@/app/contexts/ToastContext";
import { ACCEPT_STATUS, SURGERY_DEPTS, ORTHO_DEPTS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Mock firebase and lib/db BEFORE importing the hook
// ---------------------------------------------------------------------------
const { mockUpdateConsult } = vi.hoisted(() => ({
  mockUpdateConsult: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ type: "docRef" })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((...args: unknown[]) => args[0]),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  updateConsult: mockUpdateConsult,
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
 * Captures the updater function that was passed to updateConsult,
 * and calls it with the given consult snapshot.
 */
function captureAndRunUpdater(snapshot: Consult): Partial<Omit<Consult, "id">> | null {
  const call = mockUpdateConsult.mock.calls[0];
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
    it("calls updateConsult with the correct caseId", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("my-case-id", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleAccept();
      });

      expect(mockUpdateConsult).toHaveBeenCalledWith(
        "my-case-id",
        expect.any(Function),
        expect.any(Object)
      );
    });

    it("sets isUpdating=true while updating, then false after", async () => {
      let resolveUpdate: (v: ReturnType<typeof makeSuccessResult>) => void;
      mockUpdateConsult.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
      );

      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      let promise: Promise<boolean>;
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
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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

      const updated = captureAndRunUpdater(snapshot);
      expect(updated).toBeNull();
    });

    it("updater sets ACCEPT_STATUS on the surgery department", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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

      const updated = captureAndRunUpdater(snapshot);
      expect(updated).not.toBeNull();
      expect(updated!.departments![deptName].actionStatus).toBe(ACCEPT_STATUS);
    });

    it("updater sets ACCEPT_STATUS on the ortho department", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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

      const updated = captureAndRunUpdater(snapshot);
      expect(updated).not.toBeNull();
      expect(updated!.departments![deptName].actionStatus).toBe(ACCEPT_STATUS);
    });

    it("preserves existing acceptedAt if already set", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
          } as never,
        },
      });

      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.departments!["Gen Sx"].acceptedAt).toBe(existingAcceptedAt);
    });

    it("returns early and does not call updateConsult when already updating", async () => {
      let resolveFirst: (v: ReturnType<typeof makeSuccessResult>) => void;
      mockUpdateConsult.mockReturnValueOnce(
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

      // updateConsult should only be called once
      expect(mockUpdateConsult).toHaveBeenCalledTimes(1);

      // Clean up
      await act(async () => {
        resolveFirst(makeSuccessResult());
      });
    });

    it("calls onUpdate callback after successful accept", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      mockUpdateConsult.mockRejectedValueOnce(new Error("network error"));
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
      mockUpdateConsult.mockResolvedValue({
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated).not.toBeNull();
      expect(updated!.departments!["Gen Sx"].admittedAt).toBeDefined();
      expect(updated!.departments!["Gen Sx"].returnedAt).toBeUndefined();
      expect(updated!.departments!["Gen Sx"].dischargedAt).toBeUndefined();
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.departments!["Gen Sx"].returnedAt).toBeDefined();
      expect(updated!.departments!["Gen Sx"].admittedAt).toBeUndefined();
      expect(updated!.departments!["Gen Sx"].dischargedAt).toBeUndefined();
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.departments!["Gen Sx"].dischargedAt).toBeDefined();
      expect(updated!.departments!["Gen Sx"].admittedAt).toBeUndefined();
      expect(updated!.departments!["Gen Sx"].returnedAt).toBeUndefined();
    });

    it("clears previous action timestamps when changing status", async () => {
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

      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.departments!["Gen Sx"].admittedAt).toBeUndefined();
      expect(updated!.departments!["Gen Sx"].returnedAt).toBeDefined();
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
    it("calls updateConsult", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockUpdateConsult).toHaveBeenCalledOnce();
    });

    it("updater sets department status to completed", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleComplete();
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.departments!["Gen Sx"].status).toBe("completed");
      expect(updated!.departments!["Gen Sx"].completedAt).toBeDefined();
    });

    it("updater promotes overall consult status when all depts are done", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.status).toBe("completed");
    });

    it("updater does NOT set overall status when some depts are still pending", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      const updated = captureAndRunUpdater(snapshot);
      // Ortho is still pending, so overall status should NOT be "completed"
      expect(updated!.status).toBeUndefined();
    });

    it("updater returns null when dept is not pending", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated).toBeNull();
    });

    it("handles error and resets isUpdating", async () => {
      mockUpdateConsult.mockRejectedValueOnce(new Error("db error"));
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
    it("calls updateConsult", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      expect(mockUpdateConsult).toHaveBeenCalledOnce();
    });

    it("updater sets department status to cancelled", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
      const { result } = renderHook(
        () => useConsultActions("consult-1", "Gen Sx", "123456"),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleCancel();
      });

      const snapshot = makePendingConsult();
      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.departments!["Gen Sx"].status).toBe("cancelled");
      expect(updated!.departments!["Gen Sx"].completedAt).toBeDefined();
    });

    it("updater promotes overall status to completed when all depts are finished (completed or cancelled)", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      const updated = captureAndRunUpdater(snapshot);
      // Cancelling Gen Sx means Gen Sx=cancelled, Sx Trauma=completed → all done
      expect(updated!.status).toBe("completed");
    });

    it("updater does NOT set overall status when some depts are still pending", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated!.status).toBeUndefined();
    });

    it("updater returns null when dept is not pending", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      const updated = captureAndRunUpdater(snapshot);
      expect(updated).toBeNull();
    });

    it("calls onUpdate after successful cancel", async () => {
      mockUpdateConsult.mockResolvedValue(makeSuccessResult());
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
      mockUpdateConsult.mockRejectedValueOnce(new Error("cancel failed"));
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
      let resolveBackground: () => void;
      const backgroundPromise = new Promise<void>((resolve) => {
        resolveBackground = resolve;
      });

      mockUpdateConsult.mockResolvedValue({
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

      await act(async () => {
        resolveBackground();
        await backgroundPromise;
      });

      expect(result.current.isSyncing).toBe(false);
    });
  });
});