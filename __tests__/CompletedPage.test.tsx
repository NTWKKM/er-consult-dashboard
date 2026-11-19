import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import React from "react";
import type { Consult } from "@/lib/db";

const mockFetchCompletedConsultsPage = vi.fn();
const mockUpdateConsult = vi.fn();
const mockSearchCompletedConsults = vi.fn();
const mockFetchAllCompletedConsultsForExport = vi.fn();
const mockIsPermissionDeniedError = vi.fn<(...args: unknown[]) => boolean>(() => false);
const mockAddToast = vi.fn();

vi.mock("@/lib/db", () => ({
  MAX_HN_SEARCH_RESULTS: 100,
  fetchCompletedConsultsPage: (...args: unknown[]) => mockFetchCompletedConsultsPage(...args),
  transactionalUpdateConsult: (...args: unknown[]) => mockUpdateConsult(...args),
  searchCompletedConsults: (...args: unknown[]) => mockSearchCompletedConsults(...args),
  fetchAllCompletedConsultsForExport: (...args: unknown[]) => mockFetchAllCompletedConsultsForExport(...args),
  isPermissionDeniedError: (...args: unknown[]) => mockIsPermissionDeniedError(...args),
}));

vi.mock("@/app/contexts/SettingsContext", () => ({
  useSettings: () => ({ darkMode: false }),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import CompletedPage from "@/app/completed/page";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeConsult(overrides: Partial<Consult> & { id: string; hn: string }): Consult {
  return {
    firstName: "สมชาย",
    lastName: "ใจดี",
    room: "Urgent",
    problem: "ปวดท้อง",
    createdAt: "2026-11-18T08:00:00.000Z",
    status: "completed",
    isUrgent: false,
    departments: {
      "Gen Sx": { status: "completed", completedAt: "2026-11-18T09:00:00.000Z" },
    },
    ...overrides,
  };
}

function clickRowReConsult(hn: string) {
  const hnMatches = screen.getAllByText(hn);
  for (const el of hnMatches) {
    const row = el.closest("tr");
    if (row) {
      fireEvent.click(within(row).getByRole("button", { name: /Re-consult/i }));
      return;
    }
  }
  throw new Error(`Could not find desktop row for HN ${hn}`);
}

describe("CompletedPage re-consult failed drafts", () => {
  const caseA = makeConsult({
    id: "case-a",
    hn: "111111",
    firstName: "กนก",
    lastName: "ทดสอบ",
    departments: {
      "Gen Sx": { status: "completed", completedAt: "2026-11-18T09:00:00.000Z" },
    },
  });

  const caseB = makeConsult({
    id: "case-b",
    hn: "222222",
    firstName: "ขจร",
    lastName: "ทดสอบ",
    departments: {
      Ortho: { status: "completed", completedAt: "2026-11-18T09:30:00.000Z" },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchCompletedConsults.mockResolvedValue({
      consults: [],
      truncated: false,
      hasMore: false,
      lastDoc: null,
    });
    mockFetchCompletedConsultsPage.mockResolvedValue({
      consults: [caseA, caseB],
      lastDoc: undefined,
      hasMore: false,
    });
  });

  it("retains case A failed draft across case B submission and clears only case A draft once case A succeeds", async () => {
    render(<CompletedPage />);

    await screen.findAllByText("111111");
    await screen.findAllByText("222222");

    // 1. Open Case A modal, verify previous departments start unselected (preventing accidental resets),
    // select Neuro Sx, enter reason, and fail background write
    clickRowReConsult("111111");
    const modalHeadingA = await screen.findByRole("heading", { name: /Re-consult เคส/i });
    expect(modalHeadingA).toHaveTextContent("111111");

    const genSxBtnA = screen.getByRole("button", { name: /^Gen Sx/ });
    const neuroSxBtnA = screen.getByRole("button", { name: /^Neuro Sx/ });
    expect(genSxBtnA).toHaveAttribute("aria-pressed", "false");
    expect(neuroSxBtnA).toHaveAttribute("aria-pressed", "false");

    // Selecting a previous department shows the reset warning note; deselecting removes it
    fireEvent.click(genSxBtnA);
    expect(screen.getByRole("note")).toHaveTextContent(/รีเซ็ตเวลาและสถานะ/);
    fireEvent.click(genSxBtnA);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    fireEvent.click(neuroSxBtnA);
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Case A draft reason" },
    });

    const deferredA1 = createDeferred<void>();
    let onBackgroundErrorA1: ((err: unknown) => void) | undefined;
    mockUpdateConsult.mockImplementationOnce(async (_id, _updater, options) => {
      onBackgroundErrorA1 = options?.onBackgroundError;
      return {
        consult: { ...caseA, status: "pending" },
        isQueued: false,
        backgroundPromise: deferredA1.promise,
        applied: true,
      };
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Re-consult เคส/i })).not.toBeInTheDocument();
    });

    await act(async () => {
      deferredA1.reject(new Error("remote conflict"));
      onBackgroundErrorA1?.(new Error("remote conflict"));
      await Promise.resolve();
    });

    // Wait for recovery refresh to bring Case A back into the list
    await screen.findAllByText("111111");

    // 2. Open Case B modal, verify it starts clean with no departments pre-selected, select Ortho, and submit successfully
    clickRowReConsult("222222");
    const modalHeadingB = await screen.findByRole("heading", { name: /Re-consult เคส/i });
    expect(modalHeadingB).toHaveTextContent("222222");
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("");
    const orthoBtnB = screen.getByRole("button", { name: /^Ortho/ });
    expect(orthoBtnB).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Neuro Sx/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(orthoBtnB);
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Case B clean reason" },
    });

    const deferredB = createDeferred<void>();
    mockUpdateConsult.mockImplementationOnce(async () => ({
      consult: { ...caseB, status: "pending" },
      isQueued: false,
      backgroundPromise: deferredB.promise,
      applied: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Re-consult เคส/i })).not.toBeInTheDocument();
    });

    await act(async () => {
      deferredB.resolve();
      await Promise.resolve();
    });

    // 3. Reopen Case A and verify its retained reason and department selections are restored
    clickRowReConsult("111111");
    const modalHeadingA2 = await screen.findByRole("heading", { name: /Re-consult เคส/i });
    expect(modalHeadingA2).toHaveTextContent("111111");
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("Case A draft reason");
    expect(screen.getByRole("button", { name: /^Neuro Sx/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Gen Sx/ })).toHaveAttribute("aria-pressed", "false");

    // 4. Submit Case A cleanly until completion and confirm Case A's draft is then cleared
    const deferredA2 = createDeferred<void>();
    mockUpdateConsult.mockImplementationOnce(async () => ({
      consult: { ...caseA, status: "pending" },
      isQueued: false,
      backgroundPromise: deferredA2.promise,
      applied: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Re-consult เคส/i })).not.toBeInTheDocument();
    });

    await act(async () => {
      deferredA2.resolve();
      await Promise.resolve();
    });

    // Simulate Case A reappearing via search after a later completion to confirm its draft was cleared on success
    mockSearchCompletedConsults.mockResolvedValueOnce({
      consults: [caseA],
      truncated: false,
      hasMore: false,
      lastDoc: null,
    });
    fireEvent.change(screen.getByLabelText(/ค้นหา HN/i), {
      target: { value: "111111" },
    });
    await screen.findAllByText("111111");
    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /^Gen Sx/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Neuro Sx/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("retains draft when onBackgroundError fires even if backgroundPromise resolves (TRANSACTION_CONDITION_NOT_MET)", async () => {
    render(<CompletedPage />);

    await screen.findAllByText("111111");

    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });

    fireEvent.click(screen.getByRole("button", { name: /^Gen Sx/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Draft preserved on background conflict" },
    });

    const deferred = createDeferred<void>();
    let onBackgroundError: ((err: unknown) => void) | undefined;
    mockUpdateConsult.mockImplementationOnce(async (_id, _updater, options) => {
      onBackgroundError = options?.onBackgroundError;
      return {
        consult: { ...caseA, status: "pending" },
        isQueued: true,
        backgroundPromise: deferred.promise,
        applied: true,
      };
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Re-consult เคส/i })).not.toBeInTheDocument();
    });

    // Simulate real lib/db.ts behavior: onBackgroundError fires and backgroundPromise still resolves
    await act(async () => {
      onBackgroundError?.(new Error("TRANSACTION_CONDITION_NOT_MET"));
      deferred.resolve();
      await Promise.resolve();
    });

    await screen.findAllByText("111111");
    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("Draft preserved on background conflict");
  });

  it("keeps conflict draft modal accessible during a deferred refresh and after the refreshed list omits the case", async () => {
    const { container } = render(<CompletedPage />);

    await screen.findAllByText("111111");
    expect(mockFetchCompletedConsultsPage).toHaveBeenCalledTimes(1);

    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });

    const neuroSxBtn = screen.getByRole("button", { name: /^Neuro Sx/ });
    fireEvent.click(neuroSxBtn);
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Precondition conflict draft" },
    });

    const deferredRefresh = createDeferred<{
      consults: Consult[];
      lastDoc: undefined;
      hasMore: boolean;
    }>();
    mockFetchCompletedConsultsPage.mockReturnValueOnce(deferredRefresh.promise);

    mockUpdateConsult.mockResolvedValueOnce({
      consult: null,
      isQueued: false,
      backgroundPromise: null,
      applied: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));

    await waitFor(() => {
      expect(mockFetchCompletedConsultsPage).toHaveBeenCalledTimes(2);
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" })
    );
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );

    // While refresh is still pending, modal and draft remain open and accessible
    expect(screen.getByRole("heading", { name: /Re-consult เคส/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("Precondition conflict draft");
    expect(screen.getByRole("button", { name: /^Gen Sx/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Neuro Sx/ })).toHaveAttribute("aria-pressed", "true");

    // Resolve the refresh omitting caseA (moved to pending by another user)
    await act(async () => {
      deferredRefresh.resolve({
        consults: [caseB],
        lastDoc: undefined,
        hasMore: false,
      });
      await Promise.resolve();
    });

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(within(table!).queryByText("111111")).toBeNull();
    expect(within(table!).getByText("222222")).toBeInTheDocument();

    // Even though caseA is no longer in the completed list, the modal stays open with the draft accessible
    expect(screen.getByRole("heading", { name: /Re-consult เคส/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("Precondition conflict draft");
    expect(screen.getByRole("button", { name: /^Gen Sx/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Neuro Sx/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps conflict draft modal accessible if the deferred refresh rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CompletedPage />);

    await screen.findAllByText("111111");
    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });

    fireEvent.click(screen.getByRole("button", { name: /^Gen Sx/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Draft surviving failed refresh" },
    });

    const deferredRefresh = createDeferred<{
      consults: Consult[];
      lastDoc: undefined;
      hasMore: boolean;
    }>();
    mockFetchCompletedConsultsPage.mockReturnValueOnce(deferredRefresh.promise);
    mockUpdateConsult.mockResolvedValueOnce({
      consult: null,
      isQueued: false,
      backgroundPromise: null,
      applied: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));
    await waitFor(() => {
      expect(mockFetchCompletedConsultsPage).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      deferredRefresh.reject(new Error("Temporary network error"));
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: /Re-consult เคส/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("Draft surviving failed refresh");
    consoleErrorSpy.mockRestore();
  });

  it("does not advance currentPage or scroll when a superseded page fetch resolves late", async () => {
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mockFetchCompletedConsultsPage.mockResolvedValueOnce({
      consults: [caseA, caseB],
      lastDoc: { id: "cursor-1" },
      hasMore: true,
    });

    render(<CompletedPage />);
    await screen.findAllByText("111111");

    const deferredPage2 = createDeferred<{
      consults: Consult[];
      lastDoc: undefined;
      hasMore: boolean;
    }>();
    const deferredRefresh = createDeferred<{
      consults: Consult[];
      lastDoc: { id: string };
      hasMore: boolean;
    }>();

    mockFetchCompletedConsultsPage
      .mockReturnValueOnce(deferredPage2.promise)
      .mockReturnValueOnce(deferredRefresh.promise);

    // Start navigating to page 2 (slow)
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/i }));

    // Before page 2 completes, trigger a newer fetch (via re-consult precondition rejection refresh)
    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    fireEvent.click(screen.getByRole("button", { name: /^Gen Sx/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Conflict triggers newer fetch" },
    });
    mockUpdateConsult.mockResolvedValueOnce({
      consult: null,
      isQueued: false,
      backgroundPromise: null,
      applied: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));

    await waitFor(() => {
      expect(mockFetchCompletedConsultsPage).toHaveBeenCalledTimes(3);
    });

    // Newer page 1 refresh commits first
    await act(async () => {
      deferredRefresh.resolve({
        consults: [caseA, caseB],
        lastDoc: { id: "cursor-1-new" },
        hasMore: true,
      });
      await Promise.resolve();
    });

    // Superseded page 2 response resolves afterward — must NOT set page to 2 or scroll
    await act(async () => {
      deferredPage2.resolve({
        consults: [caseB],
        lastDoc: undefined,
        hasMore: false,
      });
      await Promise.resolve();
    });

    expect(screen.getByText(/หน้า 1 — แสดง 2 เคส/)).toBeInTheDocument();
    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
  });

  it("ignores stale recovery search results and errors after filters change", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<CompletedPage />);

    await screen.findAllByText("111111");

    // 1. Filter by HN 111111
    mockSearchCompletedConsults.mockResolvedValueOnce({
      consults: [caseA],
      truncated: false,
      hasMore: false,
      lastDoc: null,
    });
    fireEvent.change(screen.getByLabelText(/ค้นหา HN/i), {
      target: { value: "111111" },
    });
    await waitFor(() => {
      expect(mockSearchCompletedConsults).toHaveBeenCalledWith("111111", "");
    });

    // 2. Trigger conflict recovery search (deferred)
    clickRowReConsult("111111");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    fireEvent.click(screen.getByRole("button", { name: /^Gen Sx/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Recovery search race" },
    });

    const deferredRecovery = createDeferred<{
      consults: Consult[];
      truncated: boolean;
      hasMore: boolean;
      lastDoc: null;
    }>();
    mockSearchCompletedConsults.mockReturnValueOnce(deferredRecovery.promise);
    mockUpdateConsult.mockResolvedValueOnce({
      consult: null,
      isQueued: false,
      backgroundPromise: null,
      applied: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));
    await waitFor(() => {
      expect(mockSearchCompletedConsults).toHaveBeenCalledTimes(2);
    });

    // Close modal so table assertions are unobstructed, then switch filter to 222222
    fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง Re-consult" }));
    mockSearchCompletedConsults.mockResolvedValueOnce({
      consults: [caseB],
      truncated: false,
      hasMore: false,
      lastDoc: null,
    });
    fireEvent.change(screen.getByLabelText(/ค้นหา HN/i), {
      target: { value: "222222" },
    });

    await waitFor(() => {
      expect(mockSearchCompletedConsults).toHaveBeenCalledWith("222222", "");
    });
    const table = container.querySelector("table")!;
    await waitFor(() => {
      expect(within(table).getByText("222222")).toBeInTheDocument();
      expect(within(table).queryByText("111111")).toBeNull();
    });

    // Stale recovery search resolves with caseA — must NOT overwrite active 222222 search state
    await act(async () => {
      deferredRecovery.resolve({
        consults: [caseA],
        truncated: false,
        hasMore: false,
        lastDoc: null,
      });
      await Promise.resolve();
    });

    expect(within(table).getByText("222222")).toBeInTheDocument();
    expect(within(table).queryByText("111111")).toBeNull();

    // 3. Also verify stale recovery rejection after clearing filters does not set searchStatus="error"
    clickRowReConsult("222222");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    fireEvent.click(screen.getByRole("button", { name: /^Ortho/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "Recovery reject race" },
    });

    const deferredRecoveryErr = createDeferred<{
      consults: Consult[];
      truncated: boolean;
      hasMore: boolean;
      lastDoc: null;
    }>();
    mockSearchCompletedConsults.mockReturnValueOnce(deferredRecoveryErr.promise);
    mockUpdateConsult.mockResolvedValueOnce({
      consult: null,
      isQueued: false,
      backgroundPromise: null,
      applied: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));
    await waitFor(() => {
      expect(mockSearchCompletedConsults).toHaveBeenCalledTimes(4);
    });

    fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง Re-consult" }));
    fireEvent.change(screen.getByLabelText(/ค้นหา HN/i), {
      target: { value: "" },
    });

    await act(async () => {
      deferredRecoveryErr.reject(new Error("Stale recovery failure"));
      await Promise.resolve();
    });

    expect(screen.queryByText("การค้นหาล้มเหลว")).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it("keeps modal open with draft intact when reconsultHistory reaches 50 entries", async () => {
    const maxedHistory = Array.from({ length: 50 }, (_, idx) => ({
      at: "2026-11-18T08:00:00.000Z",
      departments: ["Gen Sx"],
      problem: `Prev ${idx}`,
    }));
    const fullHistoryCase = makeConsult({
      id: "case-max-history",
      hn: "333333",
      reconsultHistory: maxedHistory,
    });
    mockFetchCompletedConsultsPage.mockResolvedValueOnce({
      consults: [fullHistoryCase],
      lastDoc: undefined,
      hasMore: false,
    });

    render(<CompletedPage />);
    await screen.findAllByText("333333");

    clickRowReConsult("333333");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    fireEvent.click(screen.getByRole("button", { name: /^Ortho/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "51st consult reason" },
    });

    mockUpdateConsult.mockImplementationOnce(async (_id, updater: (c: Consult) => unknown) => {
      const updates = updater(fullHistoryCase);
      return {
        consult: null,
        isQueued: false,
        backgroundPromise: null,
        applied: updates !== null,
      };
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("50"),
        })
      );
    });
    expect(screen.getByRole("heading", { name: /Re-consult เคส/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("51st consult reason");
    expect(mockFetchCompletedConsultsPage).toHaveBeenCalledTimes(1);
  });

  it("keeps modal open with draft intact when combined problem exceeds 10,000 characters", async () => {
    const longProblemCase = makeConsult({
      id: "case-long-problem",
      hn: "444444",
      problem: "x".repeat(9990),
    });
    mockFetchCompletedConsultsPage.mockResolvedValueOnce({
      consults: [longProblemCase],
      lastDoc: undefined,
      hasMore: false,
    });

    render(<CompletedPage />);
    await screen.findAllByText("444444");

    clickRowReConsult("444444");
    await screen.findByRole("heading", { name: /Re-consult เคส/i });
    fireEvent.click(screen.getByRole("button", { name: /^Ortho/ }));
    fireEvent.change(screen.getByLabelText(/ปัญหาใหม่/i), {
      target: { value: "y".repeat(50) },
    });

    mockUpdateConsult.mockImplementationOnce(async (_id, updater: (c: Consult) => unknown) => {
      const updates = updater(longProblemCase);
      return {
        consult: null,
        isQueued: false,
        backgroundPromise: null,
        applied: updates !== null,
      };
    });

    fireEvent.click(screen.getByRole("button", { name: "ส่งปรึกษาใหม่" }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("10,000"),
        })
      );
    });
    expect(screen.getByRole("heading", { name: /Re-consult เคส/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ปัญหาใหม่/i)).toHaveValue("y".repeat(50));
    expect(mockFetchCompletedConsultsPage).toHaveBeenCalledTimes(1);
  });

  it("treats whitespace-only searchHN as inactive for pagination and result-count label and shows truncation notice", async () => {
    mockFetchCompletedConsultsPage.mockResolvedValueOnce({
      consults: [caseA, caseB],
      lastDoc: { id: "cursor-1" },
      hasMore: true,
    });

    render(<CompletedPage />);
    await screen.findAllByText("111111");

    fireEvent.change(screen.getByLabelText(/ค้นหา HN/i), {
      target: { value: "   " },
    });

    expect(screen.getByText(/หน้า 1 — แสดง 2 เคส/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ถัดไป/i })).toBeInTheDocument();

    mockSearchCompletedConsults.mockResolvedValueOnce({
      consults: [caseA],
      truncated: true,
      hasMore: true,
      lastDoc: null,
    });

    fireEvent.change(screen.getByLabelText(/ค้นหา HN/i), {
      target: { value: "111" },
    });

    await waitFor(() => {
      expect(screen.getByText(/จำกัดสูงสุด 100 เคส/)).toBeInTheDocument();
    });
  });
});
