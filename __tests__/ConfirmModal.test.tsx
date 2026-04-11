import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import ConfirmModal from "@/app/components/ConfirmModal";

// ---------------------------------------------------------------------------
// Default props helper
// ---------------------------------------------------------------------------

function defaultProps(overrides: Partial<Parameters<typeof ConfirmModal>[0]> = {}) {
  return {
    isOpen: true,
    title: "Confirm Action",
    message: "Are you sure?",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfirmModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------
  describe("visibility", () => {
    it("renders when isOpen is true", () => {
      render(<ConfirmModal {...defaultProps()} />);
      expect(screen.getByText("Confirm Action")).toBeInTheDocument();
      expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    });

    it("does not render when isOpen is false", () => {
      render(<ConfirmModal {...defaultProps({ isOpen: false })} />);
      expect(screen.queryByText("Confirm Action")).not.toBeInTheDocument();
    });

    it("renders default confirm text", () => {
      render(<ConfirmModal {...defaultProps()} />);
      expect(screen.getByText("ยืนยัน")).toBeInTheDocument();
    });

    it("renders default cancel text", () => {
      render(<ConfirmModal {...defaultProps()} />);
      expect(screen.getByText("ยกเลิก")).toBeInTheDocument();
    });

    it("renders custom confirm text", () => {
      render(<ConfirmModal {...defaultProps({ confirmText: "Delete" })} />);
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("renders custom cancel text", () => {
      render(<ConfirmModal {...defaultProps({ cancelText: "Go Back" })} />);
      expect(screen.getByText("Go Back")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Focus behavior: cancel button receives focus (key change in this PR)
  // -------------------------------------------------------------------------
  describe("focus behavior", () => {
    it("focuses the cancel button after opening (not the confirm button)", () => {
      render(<ConfirmModal {...defaultProps()} />);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      const cancelButton = screen.getByText("ยกเลิก");
      expect(document.activeElement).toBe(cancelButton);
    });

    it("does not focus the confirm button on open", () => {
      render(<ConfirmModal {...defaultProps()} />);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      const confirmButton = screen.getByText("ยืนยัน");
      expect(document.activeElement).not.toBe(confirmButton);
    });

    it("does not focus cancel before the 100ms timeout", () => {
      render(<ConfirmModal {...defaultProps()} />);
      const cancelButton = screen.getByText("ยกเลิก");
      // Before timer fires, cancel is not focused
      expect(document.activeElement).not.toBe(cancelButton);
    });
  });

  // -------------------------------------------------------------------------
  // Button callbacks
  // -------------------------------------------------------------------------
  describe("button callbacks", () => {
    it("calls onConfirm when confirm button is clicked", () => {
      const onConfirm = vi.fn();
      render(<ConfirmModal {...defaultProps({ onConfirm })} />);
      fireEvent.click(screen.getByText("ยืนยัน"));
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("calls onCancel when cancel button is clicked", () => {
      const onCancel = vi.fn();
      render(<ConfirmModal {...defaultProps({ onCancel })} />);
      fireEvent.click(screen.getByText("ยกเลิก"));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("calls onCancel when clicking the backdrop", () => {
      const onCancel = vi.fn();
      render(<ConfirmModal {...defaultProps({ onCancel })} />);
      const backdrop = screen.getByTestId("modal-backdrop");
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop);
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("does NOT call onCancel when clicking inside the modal dialog", () => {
      const onCancel = vi.fn();
      render(<ConfirmModal {...defaultProps({ onCancel })} />);
      const dialog = screen.getByTestId("modal-dialog");
      expect(dialog).toBeInTheDocument();
      fireEvent.click(dialog);
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard: Escape key closes modal
  // -------------------------------------------------------------------------
  describe("Escape key behavior", () => {
    it("calls onCancel when Escape is pressed while modal is open", () => {
      const onCancel = vi.fn();
      render(<ConfirmModal {...defaultProps({ onCancel })} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("does NOT call onCancel for other keys", () => {
      const onCancel = vi.fn();
      render(<ConfirmModal {...defaultProps({ onCancel })} />);
      fireEvent.keyDown(document, { key: "Enter" });
      fireEvent.keyDown(document, { key: "Tab" });
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("does NOT attach Escape handler when modal is closed", () => {
      const onCancel = vi.fn();
      render(<ConfirmModal {...defaultProps({ isOpen: false, onCancel })} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Variant styles
  // -------------------------------------------------------------------------
  describe("variant prop", () => {
    it("renders danger variant by default", () => {
      render(<ConfirmModal {...defaultProps()} />);
      const confirmBtn = screen.getByRole("button", { name: /ยืนยัน/ });
      expect(confirmBtn).toHaveAttribute("data-variant", "danger");
    });

    it("renders warning variant", () => {
      render(
        <ConfirmModal {...defaultProps({ variant: "warning" })} />
      );
      const confirmBtn = screen.getByRole("button", { name: /ยืนยัน/ });
      expect(confirmBtn).toHaveAttribute("data-variant", "warning");
    });

    it("renders info variant", () => {
      render(<ConfirmModal {...defaultProps({ variant: "info" })} />);
      const confirmBtn = screen.getByRole("button", { name: /ยืนยัน/ });
      expect(confirmBtn).toHaveAttribute("data-variant", "info");
    });
  });

  // -------------------------------------------------------------------------
  // Transition from closed to open
  // -------------------------------------------------------------------------
  describe("open/close toggling", () => {
    it("renders content when toggled from closed to open", () => {
      const { rerender } = render(
        <ConfirmModal {...defaultProps({ isOpen: false })} />
      );
      expect(screen.queryByText("Confirm Action")).not.toBeInTheDocument();

      rerender(<ConfirmModal {...defaultProps({ isOpen: true })} />);
      expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    });

    it("removes content when toggled from open to closed", () => {
      const { rerender } = render(
        <ConfirmModal {...defaultProps({ isOpen: true })} />
      );
      expect(screen.getByText("Confirm Action")).toBeInTheDocument();

      rerender(<ConfirmModal {...defaultProps({ isOpen: false })} />);
      expect(screen.queryByText("Confirm Action")).not.toBeInTheDocument();
    });
  });
});