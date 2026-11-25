import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const mockPush = vi.fn();
const mockSignInWithEmailAndPassword = vi.fn();
let mockAuthValue: { user: { uid: string } | null; loading: boolean } = {
  user: null,
  loading: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { name: "mock-auth" },
}));

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => mockAuthValue,
}));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthValue = { user: null, loading: false };
  });

  function submitPasscode(value: string) {
    const view = render(<LoginPage />);
    const input = screen.getByLabelText("Passcode");
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(input.closest("form")!);
    return view;
  }

  it("trims whitespace and strips accidental @mnrh.com domain before sign-in and waits for AuthContext user before navigating", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: "u1" } });
    const { rerender } = submitPasscode("  erresus@mnrh.com  ");

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        { name: "mock-auth" },
        "erresus@mnrh.com",
        "erresus"
      );
    });

    // Must NOT push("/") prematurely while AuthContext is still resolving user/claims
    expect(mockPush).not.toHaveBeenCalled();

    mockAuthValue = { user: { uid: "u1" }, loading: false };
    rerender(<LoginPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows config/redeploy guidance instead of wrong-passcode on invalid API key errors", async () => {
    const err = Object.assign(
      new Error("Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.)."),
      { code: "auth/api-key-not-valid.-please-pass-a-valid-api-key." }
    );
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(err);
    submitPasscode("erresus");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("การตั้งค่า Firebase ไม่ถูกต้องหรือยังไม่ได้ Redeploy");
    });
  });

  it("shows network error message on auth/network-request-failed", async () => {
    const err = Object.assign(new Error("Network error"), { code: "auth/network-request-failed" });
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(err);
    submitPasscode("erresus");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้");
    });
  });

  it("shows rate-limit message on auth/too-many-requests", async () => {
    const err = Object.assign(new Error("Too many requests"), { code: "auth/too-many-requests" });
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(err);
    submitPasscode("erresus");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("มีการลองเข้าสู่ระบบบ่อยเกินไป");
    });
  });

  it("shows disabled-account message on auth/user-disabled", async () => {
    const err = Object.assign(new Error("User disabled"), { code: "auth/user-disabled" });
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(err);
    submitPasscode("erresus");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("บัญชีผู้ใช้นี้ถูกระงับการใช้งาน");
    });
  });

  it("shows wrong-passcode message on auth/invalid-credential", async () => {
    const err = Object.assign(new Error("Invalid credential"), { code: "auth/invalid-credential" });
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(err);
    submitPasscode("wrongpass");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Passcode ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง");
    });
  });
});
