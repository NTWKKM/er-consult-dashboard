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

    it("focuses cancel immediately on open without waiting for a timeout", () => {
      render(<ConfirmModal {...defaultProps()} />);
      const cancelButton = screen.getByText("ยกเลิก");
      expect(document.activeElement).toBe(cancelButton);
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

  // -------------------------------------------------------------------------
  // Focus restoration, fallback, and Tab containment
  // -------------------------------------------------------------------------
  describe("focus restoration and containment", () => {
    it("restores focus to the previously focused opener when closed", () => {
      const { rerender } = render(
        <div>
          <button type="button">Opener</button>
          <ConfirmModal {...defaultProps({ isOpen: false })} />
        </div>
      );
      const opener = screen.getByRole("button", { name: "Opener" });
      opener.focus();
      expect(document.activeElement).toBe(opener);

      rerender(
        <div>
          <button type="button">Opener</button>
          <ConfirmModal {...defaultProps({ isOpen: true })} />
        </div>
      );
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(document.activeElement).toBe(screen.getByText("ยกเลิก"));

      rerender(
        <div>
          <button type="button">Opener</button>
          <ConfirmModal {...defaultProps({ isOpen: false })} />
        </div>
      );
      expect(document.activeElement).toBe(opener);
    });

    it("moves focus to a logical fallback if the opener is removed when closed", () => {
      const { rerender } = render(
        <main>
          <button key="opener" type="button">Opener</button>
          <button key="fallback" type="button">Fallback Button</button>
          <ConfirmModal key="modal" {...defaultProps({ isOpen: false })} />
        </main>
      );
      const opener = screen.getByRole("button", { name: "Opener" });
      opener.focus();

      rerender(
        <main>
          <button key="opener" type="button">Opener</button>
          <button key="fallback" type="button">Fallback Button</button>
          <ConfirmModal key="modal" {...defaultProps({ isOpen: true })} />
        </main>
      );
      act(() => {
        vi.advanceTimersByTime(100);
      });

      rerender(
        <main>
          <button key="fallback" type="button">Fallback Button</button>
          <ConfirmModal key="modal" {...defaultProps({ isOpen: false })} />
        </main>
      );
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Fallback Button" })
      );
    });

    it("traps Tab and Shift+Tab focus within the open dialog", () => {
      render(<ConfirmModal {...defaultProps()} />);
      const cancelBtn = screen.getByRole("button", { name: "ยกเลิก" });
      const confirmBtn = screen.getByRole("button", { name: "ยืนยัน" });

      confirmBtn.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(cancelBtn);

      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(confirmBtn);
    });

    it("restores focus and clears inert when an open ConfirmModal unmounts", () => {
      const { rerender } = render(
        <div id="app-shell-root">
          <main>
            <button key="opener" type="button">Opener</button>
            <ConfirmModal key="modal" {...defaultProps({ isOpen: false })} />
          </main>
        </div>
      );
      const appShell = document.getElementById("app-shell-root")!;
      const opener = screen.getByRole("button", { name: "Opener" });
      opener.focus();

      rerender(
        <div id="app-shell-root">
          <main>
            <button key="opener" type="button">Opener</button>
            <ConfirmModal key="modal" {...defaultProps({ isOpen: true })} />
          </main>
        </div>
      );
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "ยกเลิก" })
      );
      expect(appShell).toHaveAttribute("inert");

      // Unmount modal while open (e.g. parent card removed by subscription)
      rerender(
        <div id="app-shell-root">
          <main>
            <button key="opener" type="button">Opener</button>
          </main>
        </div>
      );
      expect(appShell).not.toHaveAttribute("inert");
      expect(document.activeElement).toBe(opener);
    });

    it("restores focus to a connected button outside a removed wrapper when both opener and modal unmount together", () => {
      const { rerender } = render(
        <main>
          <button key="outside" type="button">Outside Button</button>
          <div key="wrapper">
            <button type="button">Opener</button>
            <ConfirmModal {...defaultProps({ isOpen: false })} />
          </div>
        </main>
      );
      const opener = screen.getByRole("button", { name: "Opener" });
      opener.focus();

      rerender(
        <main>
          <button key="outside" type="button">Outside Button</button>
          <div key="wrapper">
            <button type="button">Opener</button>
            <ConfirmModal {...defaultProps({ isOpen: true })} />
          </div>
        </main>
      );
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "ยกเลิก" })
      );

      // Remove wrapper containing both opener and open ConfirmModal
      rerender(
        <main>
          <button key="outside" type="button">Outside Button</button>
        </main>
      );
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Outside Button" })
      );
    });
  });
});