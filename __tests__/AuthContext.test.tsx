import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

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

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Logout" }));
        await Promise.resolve();
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

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

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(1);
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    // Second attempt: user explicitly confirms discarding recovery data
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(2);
      expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockClearIndexedDbPersistence).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a single combined confirmation prompt when both pending writes and failed drafts remain", async () => {
    mockHasPendingOptimisticWrites.mockReturnValue(true);
    mockHasRetainedSubmitDrafts.mockReturnValue(true);
    mockWaitForPendingWrites.mockReturnValue(new Promise(() => {}));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

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

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("ข้อมูลร่าง"));
        expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("รอการซิงค์"));
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

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

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1);
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
      }
    };

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

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

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(1);
      });
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง")
      );
      expect(confirmSpy).not.toHaveBeenCalledWith(expect.stringContaining("แท็บอื่น"));
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(false);
      await waitFor(() => {
        expect(peerMessages.some((m) => m.type === "LOGOUT_RESERVATION_RELEASE")).toBe(true);
      });

      // User confirms -> clears drafts locally and broadcasts LOGOUT_CLEAR_DRAFTS to peer tab
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(2);
        expect(mockClearRetainedSubmitDraft).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(true);
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

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

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
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Logout" }));
        await new Promise((r) => setTimeout(r, 150));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("แท็บอื่น"));
      expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();

      // Still remembered on retry -> confirming proceeds with logout and broadcasts clear
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Logout" }));
        await new Promise((r) => setTimeout(r, 150));
      });

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(2);
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

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
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

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(1);
      });
      const pendingMixedPrompt = confirmSpy.mock.calls[0][0] as string;
      expect(pendingMixedPrompt).toContain("รอการซิงค์");
      expect(pendingMixedPrompt).toContain("แท็บอื่น");
      expect(pendingMixedPrompt).not.toContain("มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง");

      // Case 2: Only failed drafts known + unresponsive peer (must NOT claim pending writes are present)
      mockHasPendingOptimisticWrites.mockReturnValue(false);
      mockHasRetainedSubmitDrafts.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Logout" }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledTimes(2);
      });
      const draftMixedPrompt = confirmSpy.mock.calls[1][0] as string;
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
      for (let i = 0; i < 3; i += 1) {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }
      await waitForPeerMsg(
        (msgs) => msgs.filter((m) => m.type === "LOGOUT_RESERVATION_RENEW").length >= 3
      );
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
});
