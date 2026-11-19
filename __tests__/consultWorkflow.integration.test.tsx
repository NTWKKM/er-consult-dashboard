import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ToastProvider, useToast } from "@/app/contexts/ToastContext";
import { makeConsult, makeDepartment } from "./helpers/fixtures";

// Mock ONLY Firebase SDK — exercise REAL useConsultActions <-> REAL lib/db.ts
const { mockGetDoc, mockUpdateDoc, mockRunTransaction, mockDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockRunTransaction: vi.fn(),
  mockDoc: vi.fn(() => ({ id: "case-1" })),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: mockDoc,
  setDoc: vi.fn(),
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  runTransaction: mockRunTransaction,
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  getDocs: vi.fn(),
  arrayUnion: vi.fn((v: unknown) => ({ __arrayUnion: v })),
}));

import { useConsultActions } from "@/app/hooks/useConsultActions";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

function makeSnap(data: Record<string, unknown>) {
  return {
    id: String(data.id ?? "case-1"),
    exists: () => true,
    data: () => data,
  };
}

describe("Real-use contract: useConsultActions <-> lib/db.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Accepts a surgery case end-to-end (dotted keys), co-accepts surgery sub-depts, and shows success toast", async () => {
    const consult = makeConsult({
      id: "case-1",
      hn: "555123",
      departments: {
        "Gen Sx": makeDepartment(),
        "Neuro Sx": makeDepartment(),
        Ortho: makeDepartment(),
      },
    });

    mockGetDoc.mockResolvedValue(makeSnap(consult as unknown as Record<string, unknown>));

    const txUpdates: Record<string, unknown>[] = [];
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: vi.fn().mockResolvedValue(makeSnap(consult as unknown as Record<string, unknown>)),
        update: vi.fn((_ref: unknown, payload: Record<string, unknown>) => {
          txUpdates.push(payload);
        }),
      };
      return cb(tx);
    });

    const onUpdate = vi.fn();
    const { result } = renderHook(
      () => ({
        actions: useConsultActions("case-1", "Gen Sx", "555123", onUpdate),
        toast: useToast(),
      }),
      { wrapper }
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.actions.handleAccept();
    });

    // Regression B1: dotted-key transactionalUpdateConsult must return applied=true
    expect(ok).toBe(true);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.toast.toasts.some((t) => t.type === "success" && t.message.includes("555123"))).toBe(true);

    // Wait for background transaction to finish
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(txUpdates).toHaveLength(1);
    expect(txUpdates[0]["departments.Gen Sx.actionStatus"]).toBe("รับเคส");
    expect(txUpdates[0]["departments.Neuro Sx.actionStatus"]).toBe("รับเคส");
    expect(txUpdates[0]["departments.Ortho.actionStatus"]).toBeUndefined();
  });

  it("Blocks concurrent double-click during in-flight Accept transaction (B3) while allowing offline status/urgency updates", async () => {
    const consult = makeConsult({ id: "case-1", hn: "555123" });
    mockGetDoc.mockResolvedValue(makeSnap(consult as unknown as Record<string, unknown>));

    let resolveTx!: (val: unknown) => void;
    mockRunTransaction.mockReturnValue(
      new Promise((resolve) => {
        resolveTx = resolve;
      })
    );

    const { result } = renderHook(
      () => useConsultActions("case-1", "Gen Sx", "555123"),
      { wrapper }
    );

    await act(async () => {
      const first = await result.current.handleAccept();
      expect(first).toBe(true);
    });

    // Rapid second click must be rejected while transaction is still in flight
    await act(async () => {
      const second = await result.current.handleAccept();
      expect(second).toBe(false);
    });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);

    // Once transaction finishes, lock releases
    await act(async () => {
      resolveTx({ applied: true, consult: null });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isUpdating).toBe(false);

    // Offline updateDoc never resolves — offline urgency toggle must NOT deadlock
    mockUpdateDoc.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      const firstToggle = await result.current.handleToggleUrgency(false);
      expect(firstToggle).toBe(true);
    });
    expect(result.current.isUpdating).toBe(false);

    await act(async () => {
      const secondToggle = await result.current.handleToggleUrgency(true);
      expect(secondToggle).toBe(true);
    });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
  });

  it("Completing the last pending department transitions root status to completed", async () => {
    const consult = makeConsult({
      id: "case-1",
      hn: "555123",
      departments: {
        "Gen Sx": makeDepartment({ status: "pending", acceptedAt: "2026-01-15T08:10:00.000Z" }),
        Ortho: makeDepartment({ status: "completed", completedAt: "2026-01-15T08:20:00.000Z" }),
      },
    });
    mockGetDoc.mockResolvedValue(makeSnap(consult as unknown as Record<string, unknown>));

    const txUpdates: Record<string, unknown>[] = [];
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: vi.fn().mockResolvedValue(makeSnap(consult as unknown as Record<string, unknown>)),
        update: vi.fn((_ref: unknown, payload: Record<string, unknown>) => {
          txUpdates.push(payload);
        }),
      };
      return cb(tx);
    });

    const { result } = renderHook(
      () => ({
        actions: useConsultActions("case-1", "Gen Sx", "555123"),
        toast: useToast(),
      }),
      { wrapper }
    );

    await act(async () => {
      await result.current.actions.handleComplete();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(txUpdates).toHaveLength(1);
    expect(txUpdates[0]["departments.Gen Sx.status"]).toBe("completed");
    expect(txUpdates[0].status).toBe("completed");
    expect(result.current.toast.toasts.some((t) => t.type === "success")).toBe(true);
  });
});
