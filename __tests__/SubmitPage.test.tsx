import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Consult } from "@/lib/db";
import { makeConsult } from "./helpers/fixtures";

const mockPush = vi.fn();
const mockAddConsult = vi.fn();
const mockClearRetainedSubmitDraft = vi.fn();
const mockGetLatestFailedSubmitDraft = vi.fn<() => Consult | null>(() => null);
const mockSubscribeToFailedSubmitDrafts = vi.fn<(listener: (draft: Consult) => void) => () => void>(() => () => {});
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
  subscribeToFailedSubmitDrafts: (listener: (draft: Consult) => void) =>
    mockSubscribeToFailedSubmitDrafts(listener),
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
    mockAddConsult.mockReset();
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

  it("does not overwrite dirty form when background failure arrives, offering explicit restore instead", async () => {
    let failedListener: ((draft: Consult) => void) | null = null;
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      failedListener = listener;
      return () => {};
    });

    render(<SubmitPage />);

    // User starts typing a new consult while earlier submission is still settling
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "999999" } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "ผู้ป่วยใหม่" } });

    const reconciledDraft = makeConsult({
      id: "reconciled-1",
      hn: "111222",
      firstName: "เคสเดิม",
      lastName: "ที่ค้าง",
      room: "Urgent",
      problem: "Old problem",
      departments: { Ortho: { status: "pending", completedAt: null } },
    });

    await act(async () => {
      failedListener?.(reconciledDraft);
      await Promise.resolve();
    });

    // Current user input is preserved
    expect(screen.getByLabelText(/HN/i)).toHaveValue("999999");
    expect(screen.getByPlaceholderText("ชื่อผู้ป่วย")).toHaveValue("ผู้ป่วยใหม่");

    // Explicit restore button is shown and restores the draft on click
    const restoreBtn = screen.getByRole("button", { name: /กู้คืนข้อมูลร่าง/ });
    fireEvent.click(restoreBtn);
    expect(screen.getByLabelText(/HN/i)).toHaveValue("111222");
    expect(screen.getByPlaceholderText("ชื่อผู้ป่วย")).toHaveValue("เคสเดิม");
    expect(screen.getByLabelText("Ortho")).toBeChecked();
  });

  it("clears superseded failed draft ID only after the retried offline submission retains its own failed draft", async () => {
    mockIsOnline = false;
    const draft1 = makeConsult({
      id: "draft-1",
      hn: "123456",
      firstName: "สมชาย",
      lastName: "ใจดี",
      room: "Resus Team 1",
      problem: "First attempt",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });
    mockGetLatestFailedSubmitDraft.mockReturnValueOnce(draft1);

    let onBgError2: ((err: unknown, draft: Consult, ctx?: { notifiedListenerCount: number }) => void) | undefined;
    const draft2 = { ...draft1, id: "draft-2", problem: "Second attempt" };
    mockAddConsult.mockImplementationOnce(async (_payload, options) => {
      onBgError2 = options?.onBackgroundError;
      return draft2;
    });

    render(<SubmitPage />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByLabelText(/HN/i)).toHaveValue("123456");

    // Submit retry offline
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalled();

    // Retry also fails -> superseded draft-1 is cleared while newly retained draft-2 stays active
    await act(async () => {
      onBgError2?.(new Error("offline reject"), draft2, { notifiedListenerCount: 1 });
      await Promise.resolve();
    });
    expect(mockClearRetainedSubmitDraft).toHaveBeenCalledWith("draft-1");
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalledWith("draft-2");
  });

  it("coordinates failed-draft listener without duplicate restoration or off-page redirect hint when already on /submit", async () => {
    mockIsOnline = false;
    let capturedListener: ((draft: Consult) => void) | undefined;
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      capturedListener = listener;
      return () => {};
    });

    let onBgError: ((err: unknown, draft: Consult, ctx?: { notifiedListenerCount: number }) => void) | undefined;
    const failedDraft = makeConsult({
      id: "coord-1",
      hn: "777888",
      firstName: "ผู้ป่วย",
      lastName: "ทดสอบ",
      room: "NT",
      problem: "Coordinated error",
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

    // If still mounted: onBackgroundError restores once and subsequent listener invocation is ignored
    mockAddToast.mockClear();
    await act(async () => {
      onBgError?.(new Error("fail"), failedDraft, { notifiedListenerCount: 1 });
      capturedListener?.(failedDraft);
      await Promise.resolve();
    });
    expect(mockAddToast).toHaveBeenCalledTimes(1);

    // Fresh submission -> unmount originating SubmitPage -> remount new SubmitPage -> deliver failure via listener
    let remountedListener: ((draft: Consult) => void) | undefined;
    let onBgError2: ((err: unknown, draft: Consult, ctx?: { notifiedListenerCount: number }) => void) | undefined;
    const failedDraft2 = makeConsult({
      id: "coord-2",
      hn: "777889",
      firstName: "ผู้ป่วยสอง",
      lastName: "ทดสอบ",
      room: "Urgent",
      problem: "Second coordinated error",
      departments: { Ortho: { status: "pending", completedAt: null } },
    });
    mockAddConsult.mockImplementationOnce(async (_payload, options) => {
      onBgError2 = options?.onBackgroundError;
      return failedDraft2;
    });

    unmount();
    const firstRender = render(<SubmitPage />);
    fillValidSubmitForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    firstRender.unmount();
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      remountedListener = listener;
      return () => {};
    });

    render(<SubmitPage />);
    mockAddToast.mockClear();

    await act(async () => {
      // Originating unmounted callback suppresses return-to-submit toast while remounted listener delivers failure
      onBgError2?.(new Error("fail"), failedDraft2, { notifiedListenerCount: 1 });
      remountedListener?.(failedDraft2);
      await Promise.resolve();
    });

    expect(mockAddToast).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.not.stringContaining("กรุณากลับไปหน้า"),
      })
    );
    expect(screen.getByLabelText(/HN/i)).toHaveValue("777889");
    expect(screen.getByPlaceholderText("ชื่อผู้ป่วย")).toHaveValue("ผู้ป่วยสอง");
    expect(screen.getByLabelText("Ortho")).toBeChecked();
  });

  it("preserves unrelated pending recovery banner and keeps staff on /submit after submitting a new case", async () => {
    let failedListener: ((draft: Consult) => void) | null = null;
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      failedListener = listener;
      return () => {};
    });
    mockAddConsult.mockResolvedValueOnce(makeConsult({ id: "new-case-1", hn: "555666" }));

    render(<SubmitPage />);
    fillValidSubmitForm();

    const recoveredDraft = makeConsult({
      id: "pending-recovery-x",
      hn: "111222",
      firstName: "เคสเดิม",
      lastName: "ที่ค้าง",
      room: "Urgent",
      problem: "Needs recovery",
      departments: { Ortho: { status: "pending", completedAt: null } },
    });

    await act(async () => {
      failedListener?.(recoveredDraft);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /กู้คืนข้อมูลร่าง/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Staff stays on /submit and recovery banner for unrelated draft remains intact
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /กู้คืนข้อมูลร่าง/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/HN/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /ส่ง Consult/i })).not.toBeDisabled();
  });

  it("keeps recovery banner and stays on /submit when B fails and A completes in the same batch", async () => {
    let failedListener: ((draft: Consult) => void) | null = null;
    mockSubscribeToFailedSubmitDrafts.mockImplementation((listener: (draft: Consult) => void) => {
      failedListener = listener;
      return () => {
        if (failedListener === listener) {
          failedListener = null;
        }
      };
    });

    let resolveConsultA!: (consult: Consult) => void;
    mockAddConsult.mockImplementationOnce(
      () =>
        new Promise<Consult>((resolve) => {
          resolveConsultA = resolve;
        })
    );

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    const draftB = makeConsult({
      id: "same-batch-recovery-b",
      hn: "909090",
      firstName: "เคสค้าง",
      lastName: "ชุดเดียวกัน",
      room: "Resus Team 1",
      problem: "Queued in same batch",
      departments: { Med: { status: "pending", completedAt: null } },
    });

    // Queue B's recovery and resolve A in the exact same batch before any intermediate effect flush
    await act(async () => {
      failedListener?.(draftB);
      resolveConsultA(makeConsult({ id: "same-batch-case-a", hn: "123456" }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "กู้คืนข้อมูลร่างเคส" })).toBeInTheDocument();
    expect(screen.getByText("909090")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /กู้คืนข้อมูลร่าง/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/HN/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /ส่ง Consult/i })).not.toBeDisabled();
  });

  it("does not assign retry identity when showing banner over a dirty form, while manual and auto-restore preserve retry identity", async () => {
    mockIsOnline = false;
    let onBgError1: ((err: unknown, draft: Consult) => void) | undefined;
    const failedDraft1 = makeConsult({
      id: "banner-only-draft-1",
      hn: "123456",
      firstName: "สมชาย",
      lastName: "ใจดี",
      room: "Resus Team 1",
      problem: "First case",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });
    mockAddConsult
      .mockImplementationOnce(async (_payload, options) => {
        onBgError1 = options?.onBackgroundError;
        return failedDraft1;
      })
      .mockResolvedValueOnce(makeConsult({ id: "unrelated-case-2", hn: "888777" }));

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    // User starts filling an unrelated second case before failedDraft1 rejects
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "888777" } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "เคสใหม่" } });
    fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "ไม่เกี่ยวข้อง" } });
    fireEvent.change(screen.getByLabelText(/ห้องตรวจ/i), { target: { value: "Urgent" } });
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Separate patient" } });
    fireEvent.click(screen.getByLabelText("Ortho"));

    await act(async () => {
      onBgError1?.(new Error("offline reject"), failedDraft1);
      await Promise.resolve();
    });

    // Recovery banner is shown for failedDraft1, and submitting the unrelated case must NOT supersede failedDraft1
    expect(screen.getByRole("region", { name: "กู้คืนข้อมูลร่างเคส" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalledWith("banner-only-draft-1");
    expect(mockAddConsult).toHaveBeenLastCalledWith(
      expect.objectContaining({ hn: "888777" }),
      expect.not.objectContaining({ replacesDraftId: "banner-only-draft-1" })
    );

    // Clicking restore assigns retry identity so editing & resubmitting replaces failedDraft1
    fireEvent.click(screen.getByRole("button", { name: /กู้คืนข้อมูลร่าง/ }));
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Edited after banner restore" } });
    mockAddConsult.mockResolvedValueOnce(makeConsult({ id: "retry-after-restore" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockAddConsult).toHaveBeenLastCalledWith(
      expect.objectContaining({ problem: "Edited after banner restore" }),
      expect.objectContaining({ replacesDraftId: "banner-only-draft-1" })
    );
  });

  it("preserves auto-restore retry identity when an edited auto-restored draft is resubmitted", async () => {
    mockIsOnline = false;
    let onBgErrorAuto: ((err: unknown, draft: Consult) => void) | undefined;
    const autoRestoredDraft = makeConsult({
      id: "auto-restore-draft-2",
      hn: "555111",
      firstName: "อัตโนมัติ",
      lastName: "กู้คืน",
      room: "NT",
      problem: "Auto-restored case",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });
    mockAddConsult.mockImplementationOnce(async (_payload, options) => {
      onBgErrorAuto = options?.onBackgroundError;
      return autoRestoredDraft;
    });

    render(<SubmitPage />);
    fillValidSubmitForm();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    // Form is now blank/untouched -> background failure auto-restores into the form
    await act(async () => {
      onBgErrorAuto?.(new Error("offline reject"), autoRestoredDraft);
      await Promise.resolve();
    });
    expect(screen.getByLabelText(/HN/i)).toHaveValue("123456");

    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Edited after auto-restore" } });
    mockAddConsult.mockResolvedValueOnce(makeConsult({ id: "retry-after-auto" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockAddConsult).toHaveBeenLastCalledWith(
      expect.objectContaining({ problem: "Edited after auto-restore" }),
      expect.objectContaining({ replacesDraftId: "auto-restore-draft-2" })
    );
  });

  it("keeps active submit guard locked and preserves earlier failed draft when older submission fails during a newer submit", async () => {
    let failedListener: ((draft: Consult) => void) | null = null;
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      failedListener = listener;
      return () => {};
    });

    let onBgError1: ((err: unknown, draft: Consult) => void) | undefined;
    const failedDraft1 = makeConsult({
      id: "older-offline-1",
      hn: "222333",
      firstName: "เคสแรก",
      lastName: "ล้มเหลว",
      room: "Urgent",
      problem: "Older offline failure",
      departments: { Ortho: { status: "pending", completedAt: null } },
    });

    let resolveSubmit2!: (c: Consult) => void;
    mockIsOnline = false;
    mockAddConsult
      .mockImplementationOnce(async (_payload, options) => {
        onBgError1 = options?.onBackgroundError;
        return failedDraft1;
      })
      .mockImplementationOnce(
        () =>
          new Promise<Consult>((resolve) => {
            resolveSubmit2 = resolve;
          })
      );

    render(<SubmitPage />);

    // Dirty form before seed failure arrives so seed recovery shows in banner instead of auto-restoring
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "222333" } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "เคสแรก" } });
    fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "ล้มเหลว" } });
    fireEvent.change(screen.getByLabelText(/ห้องตรวจ/i), { target: { value: "Urgent" } });
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Older offline failure" } });
    fireEvent.click(screen.getByLabelText("Ortho"));

    await act(async () => {
      failedListener?.(
        makeConsult({
          id: "seed-recovery-0",
          hn: "000111",
          firstName: "เริ่มต้น",
          lastName: "ทดสอบ",
          room: "NT",
          problem: "Seed recovery",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      );
      await Promise.resolve();
    });

    // Submit 1 (offline) succeeds into queue and unlocks submit guard because seed recovery banner is pending
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    // User immediately starts Submission 2 (held pending)
    fillValidSubmitForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });
    const submitBtn = screen.getAllByRole("button", { name: /กำลังส่ง/ })[0];
    expect(submitBtn).toBeDisabled();

    // Older Submission 1 rejects while Submission 2 is still in-flight
    mockAddToast.mockClear();
    await act(async () => {
      onBgError1?.(new Error("older offline failure"), failedDraft1);
      await Promise.resolve();
    });

    // Earlier failed draft is preserved & reported, while Submission 2's in-flight guard stays locked!
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("222333"),
      })
    );
    expect(screen.getByText("222333")).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Double-submit click while Submission 2 is still active must remain blocked
    fireEvent.click(submitBtn);
    expect(mockAddConsult).toHaveBeenCalledTimes(2);

    // Finish Submission 2 cleanly -> stays on /submit preserving failedDraft1 banner and unlocks form
    await act(async () => {
      resolveSubmit2(makeConsult({ id: "newer-online-2", hn: "123456" }));
      await Promise.resolve();
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("222333")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ส่ง Consult/i })).not.toBeDisabled();
  });

  it("prevents restoring draft A while submission B is active and older write C fails (A/B/C/D order) so D cannot delete draft A", async () => {
    let failedListener: ((draft: Consult) => void) | null = null;
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      failedListener = listener;
      return () => {};
    });

    const draftA = makeConsult({
      id: "draft-a-abcd",
      hn: "101010",
      firstName: "เคสเอ",
      lastName: "รอส่งซ้ำ",
      room: "Resus Team 1",
      problem: "Draft A should stay safe",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });
    const olderWriteC = makeConsult({
      id: "older-write-c",
      hn: "999000",
      firstName: "เคสซีเก่า",
      lastName: "ค้างส่ง",
      room: "Urgent",
      problem: "Older offline write C",
      departments: { Ortho: { status: "pending", completedAt: null } },
    });

    let onBgErrorC: ((err: unknown, draft: Consult) => void) | undefined;
    let resolveSubmitB!: (consult: Consult) => void;
    mockIsOnline = false;
    mockAddConsult
      .mockImplementationOnce(async (_payload, options) => {
        onBgErrorC = options?.onBackgroundError;
        return olderWriteC;
      })
      .mockImplementationOnce(
        () =>
          new Promise<Consult>((resolve) => {
            resolveSubmitB = resolve;
          })
      )
      .mockResolvedValueOnce(makeConsult({ id: "unrelated-case-d", hn: "404040" }));

    render(<SubmitPage />);

    // Queue older offline write C while draft A is surfaced in the recovery banner (so C unlocks /submit without redirect)
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "999000" } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "เคสซีเก่า" } });
    fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "ค้างส่ง" } });
    fireEvent.change(screen.getByLabelText(/ห้องตรวจ/i), { target: { value: "Urgent" } });
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Older offline write C" } });
    fireEvent.click(screen.getByLabelText("Ortho"));

    await act(async () => {
      failedListener?.(draftA);
      await Promise.resolve();
    });
    expect(screen.getByText("101010")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    // Step B: Unrelated submission B starts and stays in-flight while draft A is still in banner
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "202020" } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "เคสบี" } });
    fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "กำลังส่ง" } });
    fireEvent.change(screen.getByLabelText(/ห้องตรวจ/i), { target: { value: "Urgent" } });
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Submission B" } });
    fireEvent.click(screen.getByLabelText("Ortho"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    // Step A: Attempting to restore draft A while B is active is blocked
    const restoreBtn = screen.getByRole("button", { name: /กู้คืนข้อมูลร่าง/ });
    expect(restoreBtn).toBeDisabled();
    fireEvent.click(restoreBtn);
    expect(screen.getByLabelText(/HN/i)).toHaveValue("202020");

    // Step C: Older write C fails while submission B is still pending -> C becomes banner without assigning draftA retry ID
    await act(async () => {
      onBgErrorC?.(new Error("offline reject C"), olderWriteC);
      await Promise.resolve();
    });
    expect(screen.getByText("999000")).toBeInTheDocument();

    // Submission B succeeds and resets state -> stays on /submit, form unlocks, draft A never deleted
    await act(async () => {
      resolveSubmitB(makeConsult({ id: "case-b-done", hn: "202020" }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalledWith(draftA.id);
    expect(screen.getByLabelText(/HN/i)).toHaveValue("");

    // Step D: Later unrelated submission D still must NOT delete or supersede draft A (nor C)
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "404040" } });
    fireEvent.change(screen.getByPlaceholderText("ชื่อผู้ป่วย"), { target: { value: "เคสดี" } });
    fireEvent.change(screen.getByPlaceholderText("นามสกุลผู้ป่วย"), { target: { value: "ใหม่" } });
    fireEvent.change(screen.getByLabelText(/ห้องตรวจ/i), { target: { value: "NT" } });
    fireEvent.change(screen.getByLabelText(/รายละเอียดปัญหา/i), { target: { value: "Submission D" } });
    fireEvent.click(screen.getByLabelText("Ortho"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ส่ง Consult/i }));
      await Promise.resolve();
    });

    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalledWith(draftA.id);
    expect(mockClearRetainedSubmitDraft).not.toHaveBeenCalledWith(olderWriteC.id);
    const lastCallArgs = mockAddConsult.mock.calls[mockAddConsult.mock.calls.length - 1];
    expect(lastCallArgs?.[0]).toEqual(expect.objectContaining({ hn: "404040" }));
    expect(lastCallArgs?.[1]).not.toHaveProperty("replacesDraftId");
  });

  it("offers the next eligible retained failed draft when dismissing the current recovery banner, and clears only when none remain", async () => {
    const draft1 = makeConsult({
      id: "failed-draft-1",
      hn: "111001",
      firstName: "เคสหนึ่ง",
      lastName: "ค้างอยู่",
      room: "NT",
      problem: "First remaining draft",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });
    const draft2 = makeConsult({
      id: "failed-draft-2",
      hn: "222002",
      firstName: "เคสสอง",
      lastName: "แสดงก่อน",
      room: "Urgent",
      problem: "Second draft shown first",
      departments: { Ortho: { status: "pending", completedAt: null } },
    });

    let failedListener: ((draft: Consult) => void) | null = null;
    mockSubscribeToFailedSubmitDrafts.mockImplementationOnce((listener: (draft: Consult) => void) => {
      failedListener = listener;
      return () => {};
    });

    render(<SubmitPage />);
    // Dirty the form so draft2 displays in the banner instead of auto-restoring
    fireEvent.change(screen.getByLabelText(/HN/i), { target: { value: "999999" } });

    await act(async () => {
      failedListener?.(draft2);
      await Promise.resolve();
    });
    expect(screen.getByText("222002")).toBeInTheDocument();

    // Dismissing draft2 falls back to next eligible retained draft (draft1)
    mockGetLatestFailedSubmitDraft.mockReturnValueOnce(draft1);
    fireEvent.click(screen.getByRole("button", { name: "ละทิ้งร่าง" }));

    expect(mockClearRetainedSubmitDraft).toHaveBeenCalledWith(draft2.id);
    expect(screen.getByRole("region", { name: "กู้คืนข้อมูลร่างเคส" })).toBeInTheDocument();
    expect(screen.getByText("111001")).toBeInTheDocument();

    // Dismissing draft1 when no eligible draft remains clears the banner completely
    mockGetLatestFailedSubmitDraft.mockReturnValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "ละทิ้งร่าง" }));

    expect(mockClearRetainedSubmitDraft).toHaveBeenCalledWith(draft1.id);
    expect(screen.queryByRole("region", { name: "กู้คืนข้อมูลร่างเคส" })).not.toBeInTheDocument();
  });
});
