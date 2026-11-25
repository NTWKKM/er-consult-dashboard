import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";

const {
  mockOnAuthStateChanged,
  mockSignOut,
  mockTerminate,
  mockClearIndexedDbPersistence,
  mockWaitForPendingWrites,
  mockHasPendingOptimisticWrites,
  mockHasRetainedSubmitDrafts,
  mockClearRetainedSubmitDraft,
} = vi.hoisted(() => ({
  mockOnAuthStateChanged: vi.fn(),
  mockSignOut: vi.fn(),
  mockTerminate: vi.fn(),
  mockClearIndexedDbPersistence: vi.fn(),
  mockWaitForPendingWrites: vi.fn(),
  mockHasPendingOptimisticWrites: vi.fn(() => false),
  mockHasRetainedSubmitDrafts: vi.fn(() => false),
  mockClearRetainedSubmitDraft: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { name: "mock-auth" },
  db: { name: "mock-db" },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signOut: mockSignOut,
}));

vi.mock("firebase/firestore", () => ({
  terminate: mockTerminate,
  clearIndexedDbPersistence: mockClearIndexedDbPersistence,
  waitForPendingWrites: mockWaitForPendingWrites,
}));

vi.mock("@/lib/db", () => ({
  hasPendingOptimisticWrites: mockHasPendingOptimisticWrites,
  hasRetainedSubmitDrafts: mockHasRetainedSubmitDrafts,
  clearRetainedSubmitDraft: mockClearRetainedSubmitDraft,
}));

import { AuthProvider, useAuth } from "@/app/contexts/AuthContext";
import {
  clearAllLogoutReservationsForTests,
  createLogoutReservationStore,
  isSubmissionBlockedByLogout,
} from "@/lib/logoutReservation";

function AuthProbe({ onLogoutResult }: { onLogoutResult?: (err: unknown) => void }) {
  const { user, loading, isAuthorizedStaff, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="uid">{user?.uid ?? "null"}</span>
      <span data-testid="staff">{String(isAuthorizedStaff)}</span>
      <button
        type="button"
        onClick={() => {
          void logout().then(
            () => onLogoutResult?.(null),
            (err) => onLogoutResult?.(err)
          );
        }}
      >
        Logout
      </button>
    </div>
  );
}

describe("AuthContext", () => {
  let authCallback: ((user: unknown) => void) | null = null;
  const originalLocation = window.location;
  const reloadSpy = vi.fn();

  const makeMockStaffUser = () => ({
    uid: "staff-1",
    email: "staff@mnrh.com",
    emailVerified: true,
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: { staff: true } }),
  });

  async function respondToDiscardDialog(confirm: boolean): Promise<string> {
    const dialog = await screen.findByRole("dialog");
    const text = dialog.textContent ?? "";
    const buttonName = confirm ? "ยืนยันละทิ้งและออกจากระบบ" : "ยกเลิก";
    fireEvent.click(within(dialog).getByRole("button", { name: buttonName }));
    return text;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
    mockSignOut.mockResolvedValue(undefined);
    mockTerminate.mockResolvedValue(undefined);
    mockClearIndexedDbPersistence.mockResolvedValue(undefined);
    mockWaitForPendingWrites.mockResolvedValue(undefined);
    mockHasPendingOptimisticWrites.mockReturnValue(false);
    mockHasRetainedSubmitDrafts.mockReturnValue(false);

    mockOnAuthStateChanged.mockImplementation((_auth, cb: (u: unknown) => void) => {
      authCallback = cb;
      return vi.fn();
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
  });

  afterEach(() => {
    clearAllLogoutReservationsForTests();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("ignores stale authorization result when a newer auth notification (including null) arrives", async () => {
    let resolveToken!: (res: { claims: Record<string, unknown> }) => void;
    const staleUser = {
      uid: "user-1",
      email: "staff@mnrh.com",
      emailVerified: true,
      getIdTokenResult: vi.fn(
        () =>
          new Promise<{ claims: Record<string, unknown> }>((resolve) => {
            resolveToken = resolve;
          })
      ),
    };

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(authCallback).not.toBeNull();
    act(() => {
      authCallback!(staleUser);
    });

    // Sign-out (null) arrives before staleUser's token result resolves
    act(() => {
      authCallback!(null);
    });
    expect(screen.getByTestId("uid")).toHaveTextContent("null");
    expect(screen.getByTestId("staff")).toHaveTextContent("false");

    // Stale authorization resolves afterward — must NOT resurrect user-1
    await act(async () => {
      resolveToken({ claims: { staff: true } });
      await Promise.resolve();
    });

    expect(screen.getByTestId("uid")).toHaveTextContent("null");
    expect(screen.getByTestId("staff")).toHaveTextContent("false");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("clears persistence normally on logout when no writes are pending", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => {
      authCallback!(makeMockStaffUser());
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(mockWaitForPendingWrites).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockTerminate).toHaveBeenCalledTimes(1);
      expect(mockClearIndexedDbPersistence).toHaveBeenCalledTimes(1);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("aborts logout and preserves persistence when pending writes exist and user declines discard confirmation", async () => {
    mockHasPendingOptimisticWrites.mockReturnValue(true);
    mockWaitForPendingWrites.mockReturnValue(new Promise(() => {}));

    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      await respondToDiscardDialog(false);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockTerminate).not.toHaveBeenCalled();
      expect(mockClearIndexedDbPersistence).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: originalOnLine });
    }
  });

  it("proceeds with signOut and persistence clearing when user explicitly confirms discarding pending writes", async () => {
    mockHasPendingOptimisticWrites.mockReturnValue(true);
    mockWaitForPendingWrites.mockReturnValue(new Promise(() => {}));

    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      await respondToDiscardDialog(true);

      await waitFor(() => {
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(mockClearIndexedDbPersistence).toHaveBeenCalledTimes(1);
        expect(reloadSpy).toHaveBeenCalledTimes(1);
      });
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: originalOnLine });
    }
  });

  it("requires explicit confirmation when retained failed drafts remain even if no writes are pending", async () => {
    mockHasPendingOptimisticWrites.mockReturnValue(false);
    mockHasRetainedSubmitDrafts.mockReturnValue(true);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => {
      authCallback!(makeMockStaffUser());
      await Promise.resolve();
    });

    // First attempt: user declines discarding failed draft recovery data
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    await respondToDiscardDialog(false);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    // Second attempt: user explicitly confirms discarding recovery data
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    await respondToDiscardDialog(true);

    await waitFor(() => {
      expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockClearIndexedDbPersistence).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a single combined confirmation prompt when both pending writes and failed drafts remain", async () => {
    mockHasPendingOptimisticWrites.mockReturnValue(true);
    mockHasRetainedSubmitDrafts.mockReturnValue(true);
    mockWaitForPendingWrites.mockReturnValue(new Promise(() => {}));

    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      const promptText = await respondToDiscardDialog(true);

      expect(promptText).toContain("ข้อมูลร่าง");
      expect(promptText).toContain("รอการซิงค์");
      await waitFor(() => {
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: originalOnLine });
    }
  });

  it("re-checks pending optimistic writes started during logout wait before signOut and cleanup", async () => {
    let resolveWait!: () => void;
    mockWaitForPendingWrites.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWait = resolve;
      })
    );
    mockHasPendingOptimisticWrites.mockReturnValue(false);
    mockHasRetainedSubmitDrafts.mockReturnValue(false);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => {
      authCallback!(makeMockStaffUser());
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    // A late write begins right as waitForPendingWrites resolves
    mockHasPendingOptimisticWrites.mockReturnValue(true);
    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    await respondToDiscardDialog(false);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockTerminate).not.toHaveBeenCalled();
    expect(mockClearIndexedDbPersistence).not.toHaveBeenCalled();
  });

  it("clears retained drafts when another tab signs out and Firebase delivers null user", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => {
      authCallback!(makeMockStaffUser());
      await Promise.resolve();
    });
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

    // Another tab calls signOut() -> this tab receives null in onAuthStateChanged
    act(() => {
      authCallback!(null);
    });

    expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("uid")).toHaveTextContent("null");
    expect(screen.getByTestId("staff")).toHaveTextContent("false");
  });

  it("coordinates draft-discard checks across peer tabs before logout completes", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; senderTabId?: string }> = [];
    peerChannel.onmessage = (event) => {
      const msg = event.data as { type: string; requestId?: string; senderTabId?: string };
      peerMessages.push(msg);
      if (msg.type === "HELLO") {
        peerChannel.postMessage({ type: "HELLO_ACK", tabId: "peer-tab-2" });
      } else if (msg.type === "LOGOUT_CHECK_REQUEST" && msg.requestId) {
        peerChannel.postMessage({
          type: "LOGOUT_CHECK_RESPONSE",
          requestId: msg.requestId,
          tabId: "peer-tab-2",
          hasPending: false,
          hasDrafts: true,
        });
      } else if (msg.type === "LOGOUT_TERMINATE_DB_REQUEST" && msg.requestId) {
        peerChannel.postMessage({
          type: "LOGOUT_TERMINATE_DB_ACK",
          requestId: msg.requestId,
          tabId: "peer-tab-2",
        });
      }
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      // Allow BroadcastChannel HELLO / HELLO_ACK handshake to settle
      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO")).toBe(true);
      });

      // Local tab has no drafts, but peer-tab-2 reports retained drafts -> prompts & aborts on Cancel
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      const firstPrompt = await respondToDiscardDialog(false);
      expect(firstPrompt).toContain("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง");
      expect(firstPrompt).not.toContain("แท็บอื่น");
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(false);
      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "LOGOUT_RESERVATION_RELEASE")).toBe(true);
      });
      await act(async () => {
        await Promise.resolve();
      });

      // User confirms -> clears drafts locally and broadcasts LOGOUT_CLEAR_DRAFTS to peer tab
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      await respondToDiscardDialog(true);

      await waitFor(() => {
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(true);
        expect(peerMessages.some((m) => m.type === "LOGOUT_TERMINATE_DB_REQUEST")).toBe(true);
      });
    } finally {
      peerChannel.close();
    }
  });

  it("treats an unresponsive peer tab that misses the timeout as unknown and requires discard confirmation", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string }> = [];
    peerChannel.onmessage = (event) => {
      const msg = event.data as { type: string };
      peerMessages.push(msg);
      if (msg.type === "HELLO") {
        // Register suspended peer tab, then intentionally drop LOGOUT_CHECK_REQUEST
        peerChannel.postMessage({ type: "HELLO_ACK", tabId: "suspended-peer-tab" });
      }
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO")).toBe(true);
      });

      // Peer never answers LOGOUT_CHECK_REQUEST within 120ms -> treated as unknown, requires confirmation
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      const unknownPrompt = await respondToDiscardDialog(false);

      expect(unknownPrompt).toContain("แท็บอื่น");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      // Let logout() finally block finish releasing logoutInProgressRef before clicking Logout again
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();

      // Still remembered on retry -> confirming proceeds with logout and broadcasts clear
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      await respondToDiscardDialog(true);

      await waitFor(() => {
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(true);
      });
    } finally {
      peerChannel.close();
    }
  });

  it("identifies only known dirty state plus unknown peer warning on mixed prompts", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string }> = [];
    peerChannel.onmessage = (event) => {
      const msg = event.data as { type: string };
      peerMessages.push(msg);
      if (msg.type === "HELLO") {
        // Silent peer misses 120ms timeout -> hasUnknownPeer = true
        peerChannel.postMessage({ type: "HELLO_ACK", tabId: "silent-peer-mixed" });
      }
    };

    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO")).toBe(true);
      });

      // Case 1: Only pending writes known + unresponsive peer (must NOT claim local drafts are present)
      mockHasPendingOptimisticWrites.mockReturnValue(true);
      mockHasRetainedSubmitDrafts.mockReturnValue(false);
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      const pendingMixedPrompt = await respondToDiscardDialog(false);
      expect(pendingMixedPrompt).toContain("รอการซิงค์");
      expect(pendingMixedPrompt).toContain("แท็บอื่น");
      expect(pendingMixedPrompt).not.toContain("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Case 2: Only failed drafts known + unresponsive peer (must NOT claim pending writes are present)
      await act(async () => {
        await Promise.resolve();
      });
      mockHasPendingOptimisticWrites.mockReturnValue(false);
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      const draftMixedPrompt = await respondToDiscardDialog(false);
      expect(draftMixedPrompt).toContain("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง");
      expect(draftMixedPrompt).toContain("แท็บอื่น");
      expect(draftMixedPrompt).not.toContain("รอการซิงค์");
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: originalOnLine });
      peerChannel.close();
    }
  });

  it("leaves local and peer drafts intact and surfaces error when signOut rejects", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; requestId?: string }> = [];
    peerChannel.onmessage = (event) => {
      const msg = event.data as { type: string; requestId?: string };
      peerMessages.push(msg);
      if (msg.type === "HELLO") {
        peerChannel.postMessage({ type: "HELLO_ACK", tabId: "peer-signout-fail" });
      } else if (msg.type === "LOGOUT_CHECK_REQUEST" && msg.requestId) {
        peerChannel.postMessage({
          type: "LOGOUT_CHECK_RESPONSE",
          requestId: msg.requestId,
          tabId: "peer-signout-fail",
          hasPending: false,
          hasDrafts: false,
        });
      }
    };

    const signOutErr = new Error("auth/network-request-failed");
    mockSignOut.mockRejectedValueOnce(signOutErr);
    const logoutResults: unknown[] = [];

    try {
      render(
        <AuthProvider>
          <AuthProbe onLogoutResult={(err) => logoutResults.push(err)} />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO")).toBe(true);
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      await waitFor(() => {
        expect(logoutResults).toHaveLength(1);
      });
      expect(logoutResults[0]).toBe(signOutErr);
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(false);
      expect(peerMessages.some((m) => m.type === "LOGOUT_RESERVATION_RELEASE")).toBe(true);
      expect(mockTerminate).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
    } finally {
      peerChannel.close();
    }
  });

  it("blocks new submissions on a responding tab during logout reservation and releases on cancellation or timeout", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const responses: Array<{ type: string; requestId?: string; tabId?: string }> = [];
    peerChannel.onmessage = (event) => {
      responses.push(event.data as { type: string; requestId?: string; tabId?: string });
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      expect(isSubmissionBlockedByLogout()).toBe(false);

      peerChannel.postMessage({
        type: "LOGOUT_CHECK_REQUEST",
        requestId: "reserve-req-1",
        senderTabId: "initiating-tab",
      });

      await waitFor(() => {
        expect(responses.some((m) => m.type === "LOGOUT_CHECK_RESPONSE" && m.requestId === "reserve-req-1")).toBe(true);
      });
      expect(isSubmissionBlockedByLogout()).toBe(true);

      // Releasing reservation on logout cancel unblocks submissions immediately
      peerChannel.postMessage({
        type: "LOGOUT_RESERVATION_RELEASE",
        requestId: "reserve-req-1",
        senderTabId: "initiating-tab",
      });

      await waitFor(() => {
        expect(isSubmissionBlockedByLogout()).toBe(false);
      });

      // Also auto-expires after the 5000ms TTL if the initiator disappears without releasing
      const nowSpy = vi.spyOn(Date, "now");
      nowSpy.mockReturnValue(1_000_000);
      peerChannel.postMessage({
        type: "LOGOUT_CHECK_REQUEST",
        requestId: "reserve-req-ttl",
        senderTabId: "initiating-tab",
      });

      await waitFor(() => {
        expect(responses.some((m) => m.type === "LOGOUT_CHECK_RESPONSE" && m.requestId === "reserve-req-ttl")).toBe(true);
      });
      expect(isSubmissionBlockedByLogout()).toBe(true);

      nowSpy.mockReturnValue(1_005_001);
      expect(isSubmissionBlockedByLogout()).toBe(false);
    } finally {
      peerChannel.close();
    }
  });

  it("re-announces HELLO on persisted pageshow (bfcache restore) and cleans up listener on unmount", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string });
    };

    try {
      const { unmount } = render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(peerMessages.filter((m) => m.type === "HELLO")).toHaveLength(1);
      });

      // Non-persisted pageshow must NOT re-announce HELLO
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
      await Promise.resolve();
      expect(peerMessages.filter((m) => m.type === "HELLO")).toHaveLength(1);

      // Persisted pageshow (bfcache restore) MUST re-announce HELLO
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
      await waitFor(() => {
        expect(peerMessages.filter((m) => m.type === "HELLO")).toHaveLength(2);
      });

      // Unmount removes listener so subsequent persisted pageshow does not fire
      unmount();
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
      await Promise.resolve();
      expect(peerMessages.filter((m) => m.type === "HELLO")).toHaveLength(2);
    } finally {
      peerChannel.close();
    }
  });

  it("renews peer logout reservation during a slow signOut past TTL and releases when initiator disappears", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-20T00:00:00.000Z"));

    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    type PeerMsg = { type: string; requestId?: string; requestIds?: string[] };
    const peerMessages: PeerMsg[] = [];
    const waiters: Array<() => void> = [];
    const waitForPeerMsg = (predicate: (msgs: PeerMsg[]) => boolean) =>
      new Promise<void>((resolve) => {
        if (predicate(peerMessages)) {
          resolve();
          return;
        }
        const check = () => {
          if (predicate(peerMessages)) resolve();
        };
        waiters.push(check);
      });
    const notifyWaiters = () => {
      for (const w of waiters) w();
    };

    peerChannel.onmessage = (event) => {
      const msg = event.data as PeerMsg;
      peerMessages.push(msg);
      if (msg.type === "HELLO") {
        peerChannel.postMessage({ type: "HELLO_ACK", tabId: "peer-slow-signout" });
      } else if (msg.type === "LOGOUT_CHECK_REQUEST" && msg.requestId) {
        peerChannel.postMessage({
          type: "LOGOUT_CHECK_RESPONSE",
          requestId: msg.requestId,
          tabId: "peer-slow-signout",
          hasPending: false,
          hasDrafts: false,
        });
      }
      notifyWaiters();
    };

    let resolveSignOut!: () => void;
    let signOutStarted!: () => void;
    const signOutStartedPromise = new Promise<void>((r) => {
      signOutStarted = r;
    });
    mockSignOut.mockImplementationOnce(() => {
      signOutStarted();
      return new Promise<void>((resolve) => {
        resolveSignOut = resolve;
      });
    });

    try {
      const { unmount } = render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      await waitForPeerMsg((msgs) => msgs.some((m) => m.type === "HELLO"));

      // Start logout; peer replies quickly (real microtask/IO tick via setImmediate fallback)
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      await waitForPeerMsg((msgs) => msgs.some((m) => m.type === "LOGOUT_CHECK_REQUEST"));
      await signOutStartedPromise;

      // Advance fake clock by 6000ms (3 renewal ticks at 2000ms) while signOut is still pending
      const sentRequestIds = peerMessages
        .filter((m) => m.type === "LOGOUT_CHECK_REQUEST" && typeof m.requestId === "string")
        .map((m) => m.requestId as string);
      expect(sentRequestIds.length).toBeGreaterThan(0);

      for (let i = 0; i < 3; i += 1) {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }
      await waitForPeerMsg(
        (msgs) => msgs.filter((m) => m.type === "LOGOUT_RESERVATION_RENEW").length >= 3
      );
      const renewMsgs = peerMessages.filter((m) => m.type === "LOGOUT_RESERVATION_RENEW");
      expect(renewMsgs.length).toBeGreaterThanOrEqual(3);
      expect(
        renewMsgs.every((m) => sentRequestIds.every((id) => m.requestIds?.includes(id)))
      ).toBe(true);
      expect(isSubmissionBlockedByLogout()).toBe(true);

      // Verify actual addConsult offline submission is rejected while reservation is active past 5000ms
      const actualDb = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
      await expect(
        actualDb.addConsult(
          {
            hn: "919191",
            firstName: "Slow",
            lastName: "SignOut",
            room: "NT",
            problem: "Should be blocked",
            isUrgent: false,
            status: "pending",
            departments: { "Gen Sx": { status: "pending", completedAt: null } },
          },
          { awaitRemote: false }
        )
      ).rejects.toThrow(/กำลังออกจากระบบ/);

      // Complete signOut cleanly so no pending promise hangs
      await act(async () => {
        resolveSignOut();
        await Promise.resolve();
      });

      // Also verify peer side keeps reservation active past 5000ms on RENEW and recovers when initiator sends BYE
      unmount();
      clearAllLogoutReservationsForTests();

      peerMessages.length = 0;
      peerChannel.onmessage = (event) => {
        peerMessages.push(event.data as PeerMsg);
        notifyWaiters();
      };

      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      peerChannel.postMessage({
        type: "LOGOUT_CHECK_REQUEST",
        requestId: "slow-req-1",
        senderTabId: "remote-initiator",
      });
      await waitForPeerMsg((msgs) =>
        msgs.some((m) => m.type === "LOGOUT_CHECK_RESPONSE" && m.requestId === "slow-req-1")
      );
      expect(isSubmissionBlockedByLogout()).toBe(true);

      // Renew past initial 5000ms TTL (advance 3 x 2000ms = 6000ms)
      for (let i = 0; i < 3; i += 1) {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
        peerChannel.postMessage({
          type: "LOGOUT_RESERVATION_RENEW",
          requestIds: ["slow-req-1"],
          senderTabId: "remote-initiator",
        });
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        expect(isSubmissionBlockedByLogout()).toBe(true);
      }

      // If remote initiator disappears (BYE), peer releases its reservation immediately
      peerChannel.postMessage({
        type: "BYE",
        tabId: "remote-initiator",
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(isSubmissionBlockedByLogout()).toBe(false);
    } finally {
      peerChannel.close();
      vi.useRealTimers();
    }
  });

  it("waits for all expected peers rather than finishing early when one peer reports both pending and drafts", async () => {
    const peerChannelA = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerChannelB = new BroadcastChannel("er_consult_auth_sync_v1");
    const messagesA: Array<{ type: string; requestId?: string }> = [];
    peerChannelA.onmessage = (event) => {
      const msg = event.data as { type: string; requestId?: string };
      messagesA.push(msg);
      if (msg.type === "HELLO") {
        peerChannelA.postMessage({ type: "HELLO_ACK", tabId: "peer-a-full-dirty" });
      } else if (msg.type === "LOGOUT_CHECK_REQUEST" && msg.requestId) {
        // Peer A immediately reports BOTH pending & drafts while Peer B stays silent
        peerChannelA.postMessage({
          type: "LOGOUT_CHECK_RESPONSE",
          requestId: msg.requestId,
          tabId: "peer-a-full-dirty",
          hasPending: true,
          hasDrafts: true,
        });
      }
    };
    peerChannelB.onmessage = (event) => {
      const msg = event.data as { type: string };
      if (msg.type === "HELLO") {
        peerChannelB.postMessage({ type: "HELLO_ACK", tabId: "peer-b-silent" });
      }
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(messagesA.some((m) => m.type === "HELLO")).toBe(true);
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      // Must wait for Peer B timeout and include unanswered-peer warning rather than finishing early on Peer A
      const promptText = await respondToDiscardDialog(false);
      expect(promptText).toContain("แท็บอื่น");
      expect(mockSignOut).not.toHaveBeenCalled();
    } finally {
      peerChannelA.close();
      peerChannelB.close();
    }
  });

  it("propagates active logout reservation via HELLO_ACK to tabs joining while signOut is pending", async () => {
    const latePeerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const lateMessages: Array<{ type: string; activeLogoutReservationId?: string }> = [];
    latePeerChannel.onmessage = (event) => {
      lateMessages.push(event.data as { type: string; activeLogoutReservationId?: string });
    };

    let resolveSignOut!: () => void;
    mockSignOut.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        })
    );

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });

      // Simulate a brand-new or bfcache-restored tab sending HELLO while signOut is pending
      latePeerChannel.postMessage({ type: "HELLO", tabId: "late-joining-tab" });

      await waitFor(() => {
        expect(
          lateMessages.some(
            (m) => m.type === "HELLO_ACK" && typeof m.activeLogoutReservationId === "string"
          )
        ).toBe(true);
      });

      // Also verify a receiving AuthProvider reserves submissions when HELLO_ACK includes activeLogoutReservationId
      clearAllLogoutReservationsForTests();
      latePeerChannel.onmessage = (event) => {
        const msg = event.data as { type: string };
        if (msg.type === "HELLO") {
          latePeerChannel.postMessage({
            type: "HELLO_ACK",
            tabId: "remote-logging-out-tab",
            activeLogoutReservationId: "remote-self-logout-1",
          });
        }
      };

      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(isSubmissionBlockedByLogout()).toBe(true);
      });

      await act(async () => {
        resolveSignOut();
        await Promise.resolve();
      });
    } finally {
      latePeerChannel.close();
    }
  });

  it("reports retained draft state in HELLO_ACK and requires discard consent before clearing drafts from a joining tab", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; hasDrafts?: boolean; hasPending?: boolean }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string; hasDrafts?: boolean; hasPending?: boolean });
    };

    try {
      // Case 1: Tab with retained draft emits hasDrafts: true in HELLO_ACK
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      const firstMount = render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      peerChannel.postMessage({ type: "HELLO", tabId: "probe-tab-1" });
      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO_ACK" && m.hasDrafts === true)).toBe(true);
      });
      firstMount.unmount();

      // Case 2: Joining tab reports hasDrafts: true during logout wait -> requires consent; clean joining tab stays prompt-free
      mockHasRetainedSubmitDrafts.mockReturnValue(false);
      mockHasPendingOptimisticWrites.mockReturnValue(false);
      let resolveWait!: () => void;
      mockWaitForPendingWrites.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveWait = resolve;
          })
      );
      peerMessages.length = 0;

      const secondMount = render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      // Simulate joining tab sending HELLO_ACK with hasDrafts: true while logout wait is active
      peerChannel.postMessage({
        type: "HELLO_ACK",
        tabId: "joining-tab-with-draft",
        hasPending: false,
        hasDrafts: true,
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      await act(async () => {
        resolveWait();
        await Promise.resolve();
      });

      const joinDraftPrompt = await respondToDiscardDialog(false);
      expect(joinDraftPrompt).toContain("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(false);
      secondMount.unmount();

      // Case 3: Clean joining tab (hasDrafts: false, hasPending: false) preserves prompt-free logout
      peerMessages.length = 0;
      peerChannel.onmessage = (event) => {
        const msg = event.data as { type: string; requestId?: string };
        peerMessages.push(msg);
        if (msg.type === "LOGOUT_CHECK_REQUEST" && msg.requestId) {
          peerChannel.postMessage({
            type: "LOGOUT_CHECK_RESPONSE",
            requestId: msg.requestId,
            tabId: "clean-joining-tab",
            hasPending: false,
            hasDrafts: false,
          });
        } else if (msg.type === "LOGOUT_TERMINATE_DB_REQUEST" && msg.requestId) {
          peerChannel.postMessage({
            type: "LOGOUT_TERMINATE_DB_ACK",
            requestId: msg.requestId,
            tabId: "clean-joining-tab",
          });
        }
      };
      let resolveCleanWait!: () => void;
      mockWaitForPendingWrites.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveCleanWait = resolve;
          })
      );

      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      peerChannel.postMessage({
        type: "HELLO_ACK",
        tabId: "clean-joining-tab",
        hasPending: false,
        hasDrafts: false,
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      await act(async () => {
        resolveCleanWait();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(true);
        expect(mockTerminate).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      peerChannel.close();
    }
  });

  it("preserves drafts when a dirty tab joins while signOut is pending, receives null-user notification, and user declines consent", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{
      type: string;
      requestId?: string;
      awaitConsentBeforeClear?: boolean;
      activeLogoutReservationId?: string;
    }> = [];
    peerChannel.onmessage = (event) => {
      const msg = event.data as {
        type: string;
        requestId?: string;
        awaitConsentBeforeClear?: boolean;
        activeLogoutReservationId?: string;
      };
      peerMessages.push(msg);
      if (msg.type === "LOGOUT_CHECK_REQUEST" && msg.requestId) {
        peerChannel.postMessage({
          type: "LOGOUT_CHECK_RESPONSE",
          requestId: msg.requestId,
          tabId: "restored-dirty-tab",
          hasPending: false,
          hasDrafts: true,
        });
      }
    };

    let resolveSignOut!: () => void;
    mockSignOut.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        })
    );

    try {
      const firstRender = render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });

      // Dirty restored tab joins WHILE signOut is pending -> must receive awaitConsentBeforeClear
      peerChannel.postMessage({
        type: "HELLO",
        tabId: "restored-dirty-tab",
        hasPending: false,
        hasDrafts: true,
      });

      await waitFor(() => {
        expect(
          peerMessages.some(
            (m) =>
              m.type === "HELLO_ACK" &&
              m.awaitConsentBeforeClear === true &&
              typeof m.activeLogoutReservationId === "string"
          )
        ).toBe(true);
      });

      // Null-user auth notification arrives while signOut/consent is pending -> must NOT clear draft yet
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // signOut finishes -> post-signOut consent prompt fires -> user declines
      await act(async () => {
        resolveSignOut();
        await Promise.resolve();
      });

      const postSignOutPrompt = await respondToDiscardDialog(false);
      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "LOGOUT_DECLINED_PRESERVE_DRAFTS")).toBe(true);
      });
      expect(postSignOutPrompt).toContain("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง");
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(false);
      expect(mockTerminate).not.toHaveBeenCalled();
      expect(mockClearIndexedDbPersistence).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();

      // Even a delayed null-user notification after declined logout still preserves drafts
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // Also verify the restored peer tab side preserves drafts across null-user & declined consent
      firstRender.unmount();
      peerMessages.length = 0;
      peerChannel.onmessage = (event) => {
        const msg = event.data as { type: string };
        peerMessages.push(msg);
        if (msg.type === "HELLO") {
          peerChannel.postMessage({
            type: "HELLO_ACK",
            tabId: "initiator-tab-1",
            activeLogoutReservationId: "init-res-1",
            awaitConsentBeforeClear: true,
          });
        }
      };

      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO")).toBe(true);
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      // Null-user arrives on restored peer tab before initiator resolves consent -> draft preserved
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // Initiator declines discard -> broadcasts LOGOUT_DECLINED_PRESERVE_DRAFTS -> draft stays preserved
      peerChannel.postMessage({
        type: "LOGOUT_DECLINED_PRESERVE_DRAFTS",
        senderTabId: "initiator-tab-1",
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
    } finally {
      peerChannel.close();
    }
  });

  it("protects drafts during the HELLO handshake when null-user arrives before HELLO_ACK, then clears cleanly on clean timeout", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; hasDrafts?: boolean }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string; hasDrafts?: boolean });
    };

    try {
      // Scenario 1: bfcache-restored dirty tab receives null-user BEFORE HELLO_ACK arrives
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      const restoredRender = render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      peerMessages.length = 0;
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

      // Deliver null-user notification IMMEDIATELY before HELLO_ACK arrives
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO" && m.hasDrafts === true)).toBe(true);
      });

      // Initiator sends HELLO_ACK holding clear until consent resolves
      peerChannel.postMessage({
        type: "HELLO_ACK",
        tabId: "initiator-tab-late",
        activeLogoutReservationId: "init-res-late",
        awaitConsentBeforeClear: true,
      });

      // Wait past the 120ms handshake timeout -> draft MUST remain preserved
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 160);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // Initiator declines consent -> draft remains preserved
      peerChannel.postMessage({
        type: "LOGOUT_DECLINED_PRESERVE_DRAFTS",
        senderTabId: "initiator-tab-late",
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      restoredRender.unmount();

      // Scenario 2: Clean tab with no consent hold clears cleanly without blocking
      mockHasRetainedSubmitDrafts.mockReturnValue(false);
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
    } finally {
      peerChannel.close();
    }
  });

  it("preserves dirty drafts when HELLO_ACK is delayed beyond the 120 ms handshake window and consent is later declined", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; hasDrafts?: boolean }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string; hasDrafts?: boolean });
    };

    try {
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      peerMessages.length = 0;
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

      // Null-user arrives before any HELLO_ACK
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // Wait beyond the 120 ms handshake window WITHOUT sending HELLO_ACK -> outcome is unknown -> dirty draft preserved
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 180);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // A subsequent null-user while outcome is still unknown also preserves the dirty draft
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // Delayed HELLO_ACK arrives after > 120 ms, followed by declined consent
      peerChannel.postMessage({
        type: "HELLO_ACK",
        tabId: "initiator-delayed-ack",
        activeLogoutReservationId: "init-res-delayed",
        awaitConsentBeforeClear: true,
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      peerChannel.postMessage({
        type: "LOGOUT_DECLINED_PRESERVE_DRAFTS",
        senderTabId: "initiator-delayed-ack",
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
    } finally {
      peerChannel.close();
    }
  });

  it("does not clear handshake protection on signed-in notification before delayed HELLO_ACK and declined consent", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; hasDrafts?: boolean }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string; hasDrafts?: boolean });
    };

    try {
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      // Tab announces HELLO on mount while holding a retained draft
      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "HELLO" && m.hasDrafts === true)).toBe(true);
      });

      // Signed-in currentUser notification arrives BEFORE HELLO_ACK -> must NOT settle handshake protection
      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      // Null-user notification arrives before delayed HELLO_ACK -> draft MUST remain preserved
      act(() => {
        authCallback!(null);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      // Delayed HELLO_ACK arrives after handshake window, then initiator declines consent
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

      peerChannel.postMessage({
        type: "HELLO_ACK",
        tabId: "initiator-after-signin",
        activeLogoutReservationId: "init-res-after-signin",
        awaitConsentBeforeClear: true,
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      peerChannel.postMessage({
        type: "LOGOUT_DECLINED_PRESERVE_DRAFTS",
        senderTabId: "initiator-after-signin",
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
    } finally {
      peerChannel.close();
    }
  });

  it("includes tabId in self logout reservation IDs so overlapping attempts across tabs stay isolated", async () => {
    const storeA = createLogoutReservationStore();
    const storeB = createLogoutReservationStore();
    const storeC = createLogoutReservationStore();
    const reserveSpyA = vi.spyOn(storeA, "reserveSubmissionsForLogout");
    const reserveSpyB = vi.spyOn(storeB, "reserveSubmissionsForLogout");
    const reserveSpyC = vi.spyOn(storeC, "reserveSubmissionsForLogout");
    const releaseSpyC = vi.spyOn(storeC, "releaseLogoutReservation");

    let rejectSignOutA!: (err: unknown) => void;
    let resolveSignOutB!: () => void;
    mockSignOut
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSignOutA = reject;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSignOutB = resolve;
          })
      );

    const logoutResultsA: unknown[] = [];
    const logoutResultsB: unknown[] = [];

    // Mount Tab A with its own isolated reservation store and start pending signOut #1
    const renderA = render(
      <AuthProvider reservationStore={storeA}>
        <AuthProbe onLogoutResult={(err) => logoutResultsA.push(err)} />
      </AuthProvider>
    );
    const cbA = authCallback!;
    await act(async () => {
      cbA(makeMockStaffUser());
      await Promise.resolve();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Logout" })[0]);
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
    const resIdA = reserveSpyA.mock.calls.find(([id]) => id.startsWith("self-logout-"))?.[0];
    expect(resIdA).toBeDefined();
    expect(storeA.isSubmissionBlockedByLogout()).toBe(true);
    expect(storeC.isSubmissionBlockedByLogout()).toBe(false);

    // Mount Tab B with its own isolated store simultaneously and start pending signOut #2
    const renderB = render(
      <AuthProvider reservationStore={storeB}>
        <AuthProbe onLogoutResult={(err) => logoutResultsB.push(err)} />
      </AuthProvider>
    );
    const cbB = authCallback!;
    await act(async () => {
      cbB(makeMockStaffUser());
      await Promise.resolve();
    });
    reserveSpyB.mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: "Logout" })[1]);
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(2);
    });
    const resIdB = reserveSpyB.mock.calls.find(([id]) => id.startsWith("self-logout-"))?.[0];
    expect(resIdB).toBeDefined();
    expect(resIdB).not.toBe(resIdA);
    expect(storeB.isSubmissionBlockedByLogout()).toBe(true);
    expect(storeC.isSubmissionBlockedByLogout()).toBe(false);

    // Mount third receiving Tab C with its own isolated store while BOTH A and B have signOut pending
    const renderC = render(
      <AuthProvider reservationStore={storeC}>
        <AuthProbe />
      </AuthProvider>
    );
    const cbC = authCallback!;
    await act(async () => {
      cbC(makeMockStaffUser());
      await Promise.resolve();
    });

    await waitFor(() => {
      const reservedByC = reserveSpyC.mock.calls.map(([id]) => id);
      expect(reservedByC).toContain(resIdA);
      expect(reservedByC).toContain(resIdB);
      expect(storeC.isSubmissionBlockedByLogout()).toBe(true);
    });

    // Resolve second attempt (Tab B) while Tab A remains pending
    await act(async () => {
      resolveSignOutB();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(logoutResultsB).toHaveLength(1);
    });
    expect(logoutResultsB[0]).toBeNull();
    // Tab C has not applied its signed-out state yet, so both reservations remain active
    expect(releaseSpyC.mock.calls.map(([id]) => id)).not.toContain(resIdB);
    expect(storeC.isSubmissionBlockedByLogout()).toBe(true);

    // Deliver null-user notification to Tab C; C releases B's reservation but still holds A's
    await act(async () => {
      cbC(null);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(releaseSpyC.mock.calls.map(([id]) => id)).toContain(resIdB);
    });
    expect(releaseSpyC.mock.calls.map(([id]) => id)).not.toContain(resIdA);
    expect(storeC.isSubmissionBlockedByLogout()).toBe(true);

    // Now reject first attempt (Tab A), deliver A's release, and verify no reservation remains
    const firstErr = new Error("signOut-a-failed");
    await act(async () => {
      rejectSignOutA(firstErr);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(logoutResultsA).toHaveLength(1);
      expect(releaseSpyC.mock.calls.map(([id]) => id)).toContain(resIdA);
      expect(storeC.isSubmissionBlockedByLogout()).toBe(false);
    });
    expect(logoutResultsA[0]).toBe(firstErr);
    expect(storeB.isSubmissionBlockedByLogout()).toBe(false);

    // Deliver null-user notification to Tab A so its deferred release of B's clear settles too
    await act(async () => {
      cbA(null);
      await Promise.resolve();
    });
    expect(storeA.isSubmissionBlockedByLogout()).toBe(false);

    renderC.unmount();
    renderB.unmount();
    renderA.unmount();
  });

  it("keeps receiving tab submission guard active across LOGOUT_CLEAR_DRAFTS until null-user notification arrives", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const responses: Array<{ type: string; requestId?: string }> = [];
    peerChannel.onmessage = (event) => {
      responses.push(event.data as { type: string; requestId?: string });
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      peerChannel.postMessage({
        type: "LOGOUT_CHECK_REQUEST",
        requestId: "clear-before-null-req",
        senderTabId: "initiating-tab",
      });

      await waitFor(() => {
        expect(
          responses.some(
            (m) => m.type === "LOGOUT_CHECK_RESPONSE" && m.requestId === "clear-before-null-req"
          )
        ).toBe(true);
      });
      expect(isSubmissionBlockedByLogout()).toBe(true);

      // Deliver LOGOUT_CLEAR_DRAFTS before onAuthStateChanged delivers null user
      peerChannel.postMessage({
        type: "LOGOUT_CLEAR_DRAFTS",
        senderTabId: "initiating-tab",
      });
      await waitFor(() => {
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
      });

      // Submission guard must remain active until this tab applies its signed-out state
      expect(isSubmissionBlockedByLogout()).toBe(true);
      const actualDb = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
      await expect(
        actualDb.addConsult(
          {
            hn: "828282",
            firstName: "Clear",
            lastName: "BeforeNull",
            room: "NT",
            problem: "Should be blocked until null user arrives",
            isUrgent: false,
            status: "pending",
            departments: { "Gen Sx": { status: "pending", completedAt: null } },
          },
          { awaitRemote: false }
        )
      ).rejects.toThrow(/กำลังออกจากระบบ/);

      // Once null-user notification arrives, signed-out state is applied and guard releases
      await act(async () => {
        authCallback!(null);
        await Promise.resolve();
      });
      expect(isSubmissionBlockedByLogout()).toBe(false);
    } finally {
      peerChannel.close();
    }
  }, 15000);

  it("keeps deferred peer reservation alive past the TTL until the null-user notification arrives", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const responses: Array<{ type: string; requestId?: string }> = [];
    peerChannel.onmessage = (event) => {
      responses.push(event.data as { type: string; requestId?: string });
    };
    const baseNow = Date.now();
    let offsetMs = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => baseNow + offsetMs);

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );
      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      peerChannel.postMessage({
        type: "LOGOUT_CHECK_REQUEST",
        requestId: "ttl-deferred-req",
        senderTabId: "initiating-tab",
      });
      await waitFor(() => {
        expect(
          responses.some((m) => m.type === "LOGOUT_CHECK_RESPONSE" && m.requestId === "ttl-deferred-req")
        ).toBe(true);
      });
      peerChannel.postMessage({ type: "LOGOUT_CLEAR_DRAFTS", senderTabId: "initiating-tab" });
      await waitFor(() => {
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
      });

      // Jump the clock far past the TTL without letting any renewal callback run
      offsetMs = 60_000;
      expect(isSubmissionBlockedByLogout()).toBe(true);
      const actualDb = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
      await expect(
        actualDb.addConsult(
          {
            hn: "737373",
            firstName: "Ttl",
            lastName: "Jump",
            room: "NT",
            problem: "Should stay blocked",
            isUrgent: false,
            status: "pending",
            departments: { "Gen Sx": { status: "pending", completedAt: null } },
          },
          { awaitRemote: false }
        )
      ).rejects.toThrow(/กำลังออกจากระบบ/);

      await act(async () => {
        authCallback!(null);
        await Promise.resolve();
      });
      expect(isSubmissionBlockedByLogout()).toBe(false);
    } finally {
      nowSpy.mockRestore();
      peerChannel.close();
    }
  }, 15000);

  it("keeps renewing logout reservation leases while async discard modal is open past TTL (Bug #1)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; requestIds?: string[] }> = [];
    peerChannel.onmessage = (event) => {
      const msg = event.data as { type: string; requestIds?: string[] };
      peerMessages.push(msg);
      if (msg.type === "HELLO") {
        peerChannel.postMessage({ type: "HELLO_ACK", tabId: "peer-lease-tab" });
      }
    };

    try {
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Logout" }));
        await vi.advanceTimersByTimeAsync(150);
      });

      // Async modal is open (unlike synchronous window.confirm, event loop keeps running)
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Advance 6,000ms (> 5,000ms TTL) while modal stays open -> renewals fire and submission stays blocked
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      expect(peerMessages.filter((m) => m.type === "LOGOUT_RESERVATION_RENEW").length).toBeGreaterThanOrEqual(2);
      expect(isSubmissionBlockedByLogout()).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
      peerChannel.close();
    }
  });

  it("terminates peer tab Firestore connection and replies ACK on LOGOUT_TERMINATE_DB_REQUEST (Bug #2)", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; requestId?: string }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string; requestId?: string });
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      await act(async () => {
        authCallback!(makeMockStaffUser());
        await Promise.resolve();
      });

      peerChannel.postMessage({
        type: "LOGOUT_TERMINATE_DB_REQUEST",
        requestId: "term-req-1",
        senderTabId: "initiating-tab",
      });

      await waitFor(() => {
        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(
          peerMessages.some((m) => m.type === "LOGOUT_TERMINATE_DB_ACK" && m.requestId === "term-req-1")
        ).toBe(true);
      });
    } finally {
      peerChannel.close();
    }
  });

  it("keeps loading=true while checkIsAuthorizedStaff resolves on sign-in so ProtectedRoute never bounces (Bug #8)", async () => {
    let resolveToken!: (res: { claims: Record<string, unknown> }) => void;
    const pendingUser = {
      uid: "staff-pending",
      email: "staff@mnrh.com",
      emailVerified: true,
      getIdTokenResult: vi.fn(
        () =>
          new Promise<{ claims: Record<string, unknown> }>((resolve) => {
            resolveToken = resolve;
          })
      ),
    };

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    act(() => {
      authCallback!(null);
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    act(() => {
      authCallback!(pendingUser);
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await act(async () => {
      resolveToken({ claims: { staff: true } });
      await Promise.resolve();
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("uid")).toHaveTextContent("staff-pending");
  });

  it("reloads peer tab when LOGOUT_TERMINATE_DB_REQUEST arrives after onAuthStateChanged(null) already ran", async () => {
    const peerChannel = new BroadcastChannel("er_consult_auth_sync_v1");
    const peerMessages: Array<{ type: string; requestId?: string }> = [];
    peerChannel.onmessage = (event) => {
      peerMessages.push(event.data as { type: string; requestId?: string });
    };

    try {
      render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      );

      // Simulate Firebase already propagating sign-out before LOGOUT_TERMINATE_DB_REQUEST arrives
      await act(async () => {
        authCallback!(null);
        await Promise.resolve();
      });
      expect(reloadSpy).not.toHaveBeenCalled();

      peerChannel.postMessage({
        type: "LOGOUT_TERMINATE_DB_REQUEST",
        requestId: "term-after-null-1",
        senderTabId: "initiating-tab",
      });

      await waitFor(() => {
        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(
          peerMessages.some(
            (m) => m.type === "LOGOUT_TERMINATE_DB_ACK" && m.requestId === "term-after-null-1"
          )
        ).toBe(true);
        expect(reloadSpy).toHaveBeenCalledTimes(1);
      });
    } finally {
      peerChannel.close();
    }
  });
});
