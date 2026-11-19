import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

const {
  mockOnSnapshot,
  mockDoc,
  mockSetDoc,
} = vi.hoisted(() => ({
  mockOnSnapshot: vi.fn(),
  mockDoc: vi.fn((_db: unknown, _col: string, id?: string) => ({ id: id ?? "reloaded-id" })),
  mockSetDoc: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: null,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ type: "collection" })),
  doc: mockDoc,
  setDoc: mockSetDoc,
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: mockOnSnapshot,
  query: vi.fn((...args: unknown[]) => args[0]),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "staff-1", email: "er@mnrh.com", emailVerified: true },
    loading: false,
    isAuthorizedStaff: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/app/contexts/SettingsContext", () => ({
  useSettings: () => ({
    darkMode: false,
    soundEnabled: true,
    displayMode: "card" as const,
    setDisplayMode: vi.fn(),
    toggleDarkMode: vi.fn(),
    toggleSound: vi.fn(),
  }),
}));

import { ToastProvider } from "@/app/contexts/ToastContext";
import ClientLayoutWrapper from "@/app/components/ClientLayoutWrapper";

describe("ClientLayoutWrapper reloaded pending submit draft monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("alerts the user on / and preserves a retryable draft when a reloaded pending write rejects", async () => {
    // Seed sessionStorage as if /submit queued an offline consult before page reload
    window.sessionStorage.setItem(
      "er_consult_submit_drafts_v1",
      JSON.stringify([
        {
          consult: {
            id: "reloaded-pending-1",
            hn: "889900",
            firstName: "สมชาย",
            lastName: "ใจดี",
            room: "Resus Team 1",
            problem: "Sync failure after reload",
            createdAt: "2026-11-19T00:00:00.000Z",
            status: "pending",
            isUrgent: false,
            departments: { "Gen Sx": { status: "pending", completedAt: null } },
          },
          status: "pending",
        },
      ])
    );

    vi.resetModules();
    const { ToastProvider: FreshToastProvider } = await import("@/app/contexts/ToastContext");
    const { default: FreshWrapper } = await import("@/app/components/ClientLayoutWrapper");
    const freshDb = await import("@/lib/db");

    // Capture only the reloaded draft monitor listener (ignoring ConsultsContext's collection subscription)
    let draftOnNext: ((snap: { exists: () => boolean; metadata?: { hasPendingWrites?: boolean } }) => void) | undefined;
    let draftOnError: ((err: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((target, opts, onNext, onErr) => {
      if (target && typeof target === "object" && "id" in target && target.id === "reloaded-pending-1" && opts?.includeMetadataChanges) {
        draftOnNext = onNext;
        draftOnError = onErr;
      }
      return vi.fn();
    });

    // Silence unused-import warning on static ToastProvider/ClientLayoutWrapper
    expect(ToastProvider).toBeDefined();
    expect(ClientLayoutWrapper).toBeDefined();

    render(
      <FreshToastProvider>
        <FreshWrapper>
          <div>Dashboard Page</div>
        </FreshWrapper>
      </FreshToastProvider>
    );

    expect(draftOnNext).toBeDefined();

    // First snapshot from local cache hasPendingWrites: true -> no error yet
    act(() => {
      draftOnNext!({ exists: () => true, metadata: { hasPendingWrites: true } });
    });
    expect(screen.queryByText(/889900/)).not.toBeInTheDocument();

    // Queued write later rejects after reload
    await act(async () => {
      draftOnError!(new Error("permission-denied"));
      await Promise.resolve();
    });

    // User sees the error toast on "/" and the draft is retained as retryable
    expect(await screen.findByText(/ซิงค์เคส HN: 889900 ไม่สำเร็จ/)).toBeInTheDocument();
    expect(freshDb.getLatestFailedSubmitDraft()?.id).toBe("reloaded-pending-1");
  });
});
