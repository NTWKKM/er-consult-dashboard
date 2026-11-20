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

function AuthProbe() {
  const { user, loading, isAuthorizedStaff, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="uid">{user?.uid ?? "null"}</span>
      <span data-testid="staff">{String(isAuthorizedStaff)}</span>
      <button type="button" onClick={() => void logout()}>
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
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Logout" }));
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("ข้อมูลร่าง"));
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(peerMessages.some((m) => m.type === "LOGOUT_CLEAR_DRAFTS")).toBe(false);

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
});
