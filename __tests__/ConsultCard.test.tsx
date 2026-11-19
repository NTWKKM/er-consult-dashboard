import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import ConsultCard from "@/app/components/ConsultCard";
import { makeConsult } from "./helpers/fixtures";

const mockHandleAccept = vi.fn();
const mockHandleStatusChange = vi.fn();
const mockHandleComplete = vi.fn();
const mockHandleCancel = vi.fn();
const mockHandleToggleUrgency = vi.fn();

vi.mock("@/app/hooks/useConsultActions", () => ({
  useConsultActions: () => ({
    isUpdating: false,
    isSyncing: false,
    handleAccept: mockHandleAccept,
    handleStatusChange: mockHandleStatusChange,
    handleComplete: mockHandleComplete,
    handleCancel: mockHandleCancel,
    handleToggleUrgency: mockHandleToggleUrgency,
  }),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/lib/db", () => ({
  transferConsultRoom: vi.fn(),
}));

describe("ConsultCard clinical interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleAccept.mockResolvedValue(true);
    mockHandleToggleUrgency.mockResolvedValue(true);
    mockHandleComplete.mockResolvedValue(undefined);
    mockHandleCancel.mockResolvedValue(undefined);
  });

  it("renders patient info, FAST badge, disabled ปิดเคส before accept, and uses reconsultedAt for active ElapsedTime", () => {
    const oldCreatedAt = new Date(Date.now() - 180 * 60 * 1000).toISOString();
    const recentReconsultedAt = new Date().toISOString();

    const consult = makeConsult({
      id: "card-1",
      hn: "5551234",
      firstName: "สมหญิง",
      lastName: "ทดสอบ",
      room: "Resus Team 1",
      problem: "Blunt chest trauma",
      isUrgent: true,
      createdAt: oldCreatedAt,
      reconsultedAt: recentReconsultedAt,
      departments: {
        "Gen Sx": { status: "pending", completedAt: null },
        Ortho: { status: "pending", completedAt: null },
      },
    });

    render(<ConsultCard caseData={consult} caseId="card-1" departmentName="Gen Sx" />);

    expect(screen.getByText(/5551234/)).toBeInTheDocument();
    expect(screen.getByText("สมหญิง ทดสอบ")).toBeInTheDocument();
    expect(screen.getByText("FAST")).toBeInTheDocument();
    expect(screen.getByText("Resus Team 1")).toBeInTheDocument();
    expect(screen.getByText(/Blunt chest trauma/)).toBeInTheDocument();
    // Active wait timer reflects reconsultedAt (0 นาที) rather than oldCreatedAt (3 ชม.)
    expect(screen.getByText(/รอ 0 นาที/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /รับเคส/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /ปิดเคส/ })).toBeDisabled();
  });

  it("calls handleAccept when รับเคส is clicked", async () => {
    const consult = makeConsult({
      id: "card-2",
      hn: "6661111",
      departments: { "Gen Sx": { status: "pending", completedAt: null } },
    });

    render(<ConsultCard caseData={consult} caseId="card-2" departmentName="Gen Sx" />);
    fireEvent.click(screen.getByRole("button", { name: /รับเคส/ }));
    expect(mockHandleAccept).toHaveBeenCalledTimes(1);
  });

  it("guards urgency toggle and cancel behind ConfirmModal", () => {
    const consult = makeConsult({
      id: "card-3",
      hn: "7772222",
      isUrgent: false,
      departments: { Ortho: { status: "pending", completedAt: null } },
    });

    render(<ConsultCard caseData={consult} caseId="card-3" departmentName="Ortho" />);

    // Urgency toggle -> ConfirmModal
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนเป็นเคส FAST TRACK" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(mockHandleToggleUrgency).toHaveBeenCalledWith(false);

    // Cancel -> ConfirmModal
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกปรึกษา" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันยกเลิก" }));
    expect(mockHandleCancel).toHaveBeenCalledTimes(1);
  });

  it("enables ปิดเคส after accept + status selection and triggers handleComplete on confirm", () => {
    const now = new Date().toISOString();
    const consult = makeConsult({
      id: "card-4",
      hn: "8883333",
      departments: {
        "Gen Sx": {
          status: "pending",
          completedAt: null,
          acceptedAt: now,
          actionStatus: "Admit",
          admittedAt: now,
        },
      },
    });

    render(<ConsultCard caseData={consult} caseId="card-4" departmentName="Gen Sx" />);

    const statusSelect = screen.getByLabelText("เลือกสถานะถัดไป");
    expect(statusSelect).toHaveValue("Admit");
    fireEvent.change(statusSelect, { target: { value: "D/C" } });
    expect(mockHandleStatusChange).toHaveBeenCalledWith("D/C");

    const closeBtn = screen.getByRole("button", { name: /ปิดเคส/ });
    expect(closeBtn).toBeEnabled();
    fireEvent.click(closeBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันปิดเคส" }));
    expect(mockHandleComplete).toHaveBeenCalledTimes(1);
  });
});
