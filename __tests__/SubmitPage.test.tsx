import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

const mockPush = vi.fn();
const mockAddConsult = vi.fn();
const mockAddToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/db", () => ({
  addConsult: (...args: unknown[]) => mockAddConsult(...args),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: mockAddToast }),
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
});
