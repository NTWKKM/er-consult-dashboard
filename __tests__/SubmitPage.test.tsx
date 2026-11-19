import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Consult } from "@/lib/db";
import { makeConsult } from "./helpers/fixtures";

const mockPush = vi.fn();
const mockAddConsult = vi.fn();
const mockClearRetainedSubmitDraft = vi.fn();
const mockGetLatestFailedSubmitDraft = vi.fn<() => Consult | null>(() => null);
const mockReconcileReloadedSubmitDrafts = vi.fn<() => Promise<Consult | null>>(async () => null);
const mockSubscribeToFailedSubmitDrafts = vi.fn<() => () => void>(() => () => {});
const mockAddToast = vi.fn();
let mockPendingCases: Consult[] = [];
let mockIsOnline = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/db", () => ({
  addConsult: (...args: unknown[]) => mockAddConsult(...args),
  clearRetainedSubmitDraft: (...args: unknown[]) => mockClearRetainedSubmitDraft(...args),
  getLatestFailedSubmitDraft: () => mockGetLatestFailedSubmitDraft(),
  reconcileReloadedSubmitDrafts: () => mockReconcileReloadedSubmitDrafts(),
  subscribeToFailedSubmitDrafts: () => mockSubscribeToFailedSubmitDrafts(),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/app/contexts/ConsultsContext", () => ({
  usePendingConsults: () => ({ cases: mockPendingCases, loading: false, error: null }),
}));

vi.mock("@/app/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => mockIsOnline,
}));

import SubmitPage from "@/app/submit/page";

function fillValidSubmitForm() {
  fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "123456" } });
  fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "สมชาย" } });
  fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "ใจดี" } });
  fireEvent.change(screen.getByLabelText(/ห้องตรวจ/i), { target: { value: "Resus Team 1" } });
  fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Acute abdomen" } });
  fireEvent.click(screen.getByLabelText("Gen Sx"));
}

describe("SubmitPage mount and redirect safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPendingCases = [];
    mockIsOnline = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not schedule or trigger redirect after unmounting while addConsult is pending", async () => {
    let resolveAddConsult!: () => void;
    mockAddConsult.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveAddConsult = resolve;
      })
    );

    const { unmount } = render(<SubmitPage />);
    fillValidSubmitForm();

    fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
    expect(mockAddConsult).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      resolveAddConsult();
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects to dashboard 1500ms after mounted successful submission", async () => {
    mockAddConsult.mockResolvedValueOnce({ id: "new-case" });

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
    expect(mockPush).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("resets loading lock on failed submission so the user can retry", async () => {
    mockAddConsult
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ id: "retry-case" });

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
    const submitBtn = screen.getByRole("button", { name: /ส่ง Consult/i });
    expect(submitBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(submitBtn);
      await Promise.resolve();
    });

    expect(mockAddConsult).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("sanitizes non-numeric HN characters and exposes aria-invalid + aria-describedby on validation errors", () => {
    render(<SubmitPage />);

    const hnInput = screen.getByLabelText(/HN/i);
    fireEvent.change(hnInput, { target: { value: "abc123-45!@#" } });
    expect(hnInput).toHaveValue("12345");

    // Clear HN and submit empty form -> validation marks fields aria-invalid="true"
    fireEvent.change(hnInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));

    expect(hnInput).toHaveAttribute("aria-invalid", "true");
    expect(hnInput).toHaveAttribute("aria-describedby", "hn-error");
    expect(screen.getByText("กรุณากรอก HN")).toHaveAttribute("id", "hn-error");
  });

  it("displays duplicate pending consult warning banner with department and room (zero extra reads)", () => {
    mockPendingCases = [
      makeConsult({
        id: "existing-1",
        hn: "123456",
        room: "Resus Team 2",
        departments: {
          "Gen Sx": { status: "pending", completedAt: null },
        },
      }),
    ];

    render(<SubmitPage />);
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByLabelText("Gen Sx"));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("123456");
    expect(alert).toHaveTextContent("Gen Sx (Resus Team 2)");
  });

  it("submits optimistically with awaitRemote=false when offline so form never freezes", async () => {
    mockIsOnline = false;
    mockAddConsult.mockResolvedValueOnce({ id: "offline-case" });

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockAddConsult).toHaveBeenCalledWith(
      expect.objectContaining({ hn: "123456", isUrgent: false }),
      expect.objectContaining({ awaitRemote: false })
    );
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: expect.stringContaining("บันทึกเคสในเครื่องแล้ว"),
      })
    );
  });

  it("triggers Fast Track submission on Cmd/Ctrl+Enter shortcut", async () => {
    mockAddConsult.mockResolvedValueOnce({ id: "fast-case" });

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Enter", metaKey: true });
      await Promise.resolve();
    });

    expect(mockAddConsult).toHaveBeenCalledWith(
      expect.objectContaining({ hn: "123456", isUrgent: true })
    );
  });

  it("uses type=submit for normal submission and keeps Fast Track as type=button", () => {
    render(<SubmitPage />);
    expect(screen.getByRole("button", { name: /ส่ง Consult/i })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: /FAST TRACK/i })).toHaveAttribute("type", "button");
  });

  it("validates Firestore create length limits for HN, patient name, and problem without clearing values", async () => {
    render(<SubmitPage />);
    fillValidSubmitForm();

    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "1".repeat(33) } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "ก".repeat(201) } });
    fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "ข".repeat(201) } });
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "p".repeat(5001) } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockAddConsult).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/HN/i)).toHaveValue("1".repeat(33));
    expect(screen.getByPlaceholderText("ชื่อผู้ป่วย")).toHaveValue("ก".repeat(201));
    expect(screen.getByPlaceholderText("นามสกุลผู้ป่วย")).toHaveValue("ข".repeat(201));
    expect(screen.getByLabelText(/รายละเอียดปัญหา/i)).toHaveValue("p".repeat(5001));
    expect(screen.getByText(/HN ต้องไม่เกิน 32 หลัก/)).toBeInTheDocument();
    expect(screen.getByText(/ชื่อต้องไม่เกิน 200 ตัวอักษร/)).toBeInTheDocument();
    expect(screen.getByText(/นามสกุลต้องไม่เกิน 200 ตัวอักษร/)).toBeInTheDocument();
    expect(screen.getByText(/รายละเอียดปัญหาต้องไม่เกิน 5,000 ตัวอักษร/)).toBeInTheDocument();
  });

  it("restores submitted values and cancels redirect when offline background write rejects", async () => {
    mockIsOnline = false;
    let onBgError: ((err: unknown, draft: Consult) => void) | undefined;
    mockAddConsult.mockImplementationOnce(async (payload, options) => {
      onBgError = options?.onBackgroundError;
      return { id: "offline-fail-1", createdAt: "2026-11-19T00:00:00.000Z", ...payload };
    });

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

    await act(async () => {
      onBgError?.(new Error("permission-denied"), makeConsult({ id: "offline-fail-1", hn: "123456" }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/HN/i)).toHaveValue("123456");
    expect(screen.getByPlaceholderText("ชื่อผู้ป่วย")).toHaveValue("สมชาย");
    expect(screen.getByPlaceholderText("นามสกุลผู้ป่วย")).toHaveValue("ใจดี");
    expect(screen.getByLabelText(/รายละเอียดปัญหา/i)).toHaveValue("Acute abdomen");
    expect(screen.getByRole("button", { name: /ส่ง Consult/i })).not.toBeDisabled();
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("reports failed sync toast after 1.5s redirect and restores failed draft when returning to /submit", async () => {
    mockIsOnline = false;
    let onBgError: ((err: unknown, draft: Consult) => void) | undefined;
    const failedDraft = makeConsult({
      id: "offline-post-nav-1",
      hn: "123456",
      firstName: "สมชาย",
      lastName: "ใจดี",
      room: "Resus Team 1",
      problem: "Acute abdomen",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });

    mockAddConsult.mockImplementationOnce(async (_payload, options) => {
      onBgError = options?.onBackgroundError;
      return failedDraft;
    });

    const { unmount } = render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockPush).toHaveBeenCalledWith("/");

    // Simulate Next.js route transition unmounting SubmitPage before background write rejects
    unmount();
    mockAddToast.mockClear();

    await act(async () => {
      onBgError?.(new Error("permission-denied"), failedDraft);
      await Promise.resolve();
    });

    // Global ToastContext still surfaces the failure alert after navigation
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("123456"),
      })
    );

    // Returning to /submit (or reloading) restores the persisted draft into the form
    mockGetLatestFailedSubmitDraft.mockReturnValueOnce(failedDraft);
    render(<SubmitPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText(/HN/i)).toHaveValue("123456");
    expect(screen.getByPlaceholderText("ชื่อผู้ป่วย")).toHaveValue("สมชาย");
    expect(screen.getByPlaceholderText("นามสกุลผู้ป่วย")).toHaveValue("ใจดี");
    expect(screen.getByLabelText(/รายละเอียดปัญหา/i)).toHaveValue("Acute abdomen");
    expect(screen.getByLabelText("Gen Sx")).toBeChecked();
  });
});
