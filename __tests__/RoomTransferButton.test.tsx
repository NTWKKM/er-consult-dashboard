import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mock db BEFORE importing the component
// ---------------------------------------------------------------------------
const { mockTransferConsultRoom } = vi.hoisted(() => ({
  mockTransferConsultRoom: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  transferConsultRoom: mockTransferConsultRoom,
}));

const { mockAddToast } = vi.hoisted(() => ({
  mockAddToast: vi.fn(),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { RoomTransferButton } from "@/app/components/RoomTransferButton";
import { ROOMS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderButton(props: Partial<React.ComponentProps<typeof RoomTransferButton>> = {}) {
  return render(
    <RoomTransferButton
      consultId="test-consult-1"
      currentRoom="NT"
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RoomTransferButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransferConsultRoom.mockResolvedValue({
      transferred: true,
      backgroundPromise: null,
    });
  });

  // -------------------------------------------------------------------------
  // Initial render
  // -------------------------------------------------------------------------
  describe("initial render", () => {
    it("renders the transfer button", () => {
      renderButton();
      expect(screen.getByTitle("เปลี่ยนห้อง")).toBeInTheDocument();
    });

    it("does not show dropdown initially", () => {
      renderButton();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("button has aria-expanded=false initially", () => {
      renderButton();
      const btn = screen.getByTitle("เปลี่ยนห้อง");
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("button has aria-haspopup=listbox", () => {
      renderButton();
      const btn = screen.getByTitle("เปลี่ยนห้อง");
      expect(btn).toHaveAttribute("aria-haspopup", "listbox");
    });
  });

  // -------------------------------------------------------------------------
  // Dropdown opening/closing
  // -------------------------------------------------------------------------
  describe("dropdown open/close", () => {
    it("opens dropdown when button is clicked", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("shows header text when dropdown is open", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByText("ย้ายผู้ป่วยไปยัง...")).toBeInTheDocument();
    });

    it("closes dropdown when button is clicked again", () => {
      renderButton();
      const btn = screen.getByTitle("เปลี่ยนห้อง");
      fireEvent.click(btn);
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("closes dropdown when Escape key is pressed", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("closes dropdown when clicking outside", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      // Click on the document body outside the component
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("sets aria-expanded=true when open", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByTitle("เปลี่ยนห้อง")).toHaveAttribute("aria-expanded", "true");
    });
  });

  // -------------------------------------------------------------------------
  // Room list ordering (SSW should be first)
  // -------------------------------------------------------------------------
  describe("room list ordering", () => {
    it("shows SSW as the first room option", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("SSW");
    });

    it("shows all ROOMS in the dropdown", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      ROOMS.forEach((room) => {
        expect(screen.getByRole("option", { name: new RegExp(room) })).toBeInTheDocument();
      });
    });

    it("marks the current room as selected", () => {
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const ntOption = screen.getByRole("option", { name: /NT/ });
      expect(ntOption).toHaveAttribute("aria-selected", "true");
    });

    it("does not mark other rooms as selected", () => {
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      expect(sswOption).toHaveAttribute("aria-selected", "false");
    });
  });

  // -------------------------------------------------------------------------
  // Transfer logic
  // -------------------------------------------------------------------------
  describe("transfer logic", () => {
    it("calls transferConsultRoom with correct args when a different room is selected", async () => {
      renderButton({ currentRoom: "NT", consultId: "consult-abc" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      fireEvent.click(sswOption);

      await waitFor(() => {
        expect(mockTransferConsultRoom).toHaveBeenCalledWith(
          "consult-abc",
          "SSW",
          expect.any(Function)
        );
      });
    });

    it("does NOT call transferConsultRoom when current room is clicked", async () => {
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const ntOption = screen.getByRole("option", { name: /NT/ });
      fireEvent.click(ntOption);

      await waitFor(() => {
        expect(mockTransferConsultRoom).not.toHaveBeenCalled();
      });
    });

    it("closes dropdown immediately when same room is clicked", () => {
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      const ntOption = screen.getByRole("option", { name: /NT/ });
      fireEvent.click(ntOption);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("shows success toast on successful transfer", async () => {
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      fireEvent.click(sswOption);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "success",
            message: expect.stringContaining("SSW"),
          })
        );
      });
    });

    it("shows error toast when transfer throws", async () => {
      mockTransferConsultRoom.mockRejectedValueOnce(new Error("Network error"));
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      fireEvent.click(sswOption);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "error",
          })
        );
      });
    });

    it("calls onTransferStart when a transfer begins", async () => {
      const onTransferStart = vi.fn();
      renderButton({ currentRoom: "NT", onTransferStart });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      fireEvent.click(sswOption);

      await waitFor(() => {
        expect(onTransferStart).toHaveBeenCalledOnce();
      });
    });

    it("calls onTransferEnd on successful transfer", async () => {
      const onTransferEnd = vi.fn();
      renderButton({ currentRoom: "NT", onTransferEnd });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      fireEvent.click(sswOption);

      await waitFor(() => {
        expect(onTransferEnd).toHaveBeenCalledOnce();
      });
    });

    it("does NOT call onTransferEnd when transfer returns transferred=false", async () => {
      mockTransferConsultRoom.mockResolvedValueOnce({
        transferred: false,
        backgroundPromise: null,
      });
      const onTransferEnd = vi.fn();
      renderButton({ currentRoom: "NT", onTransferEnd });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      const sswOption = screen.getByRole("option", { name: /^SSW$/ });
      fireEvent.click(sswOption);

      await waitFor(() => {
        expect(mockTransferConsultRoom).toHaveBeenCalled();
      });
      expect(onTransferEnd).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------
  describe("keyboard navigation", () => {
    it("ArrowDown advances focus index", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      // First ArrowDown should focus index 0 (SSW)
      act(() => {
        fireEvent.keyDown(document, { key: "ArrowDown" });
      });

      const options = screen.getAllByRole("option");
      expect(document.activeElement).toBe(options[0]);
    });

    it("ArrowUp wraps to last item from first item", () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      // Start at index 0, then go up should wrap to last
      act(() => {
        fireEvent.keyDown(document, { key: "ArrowDown" }); // index 0
      });
      act(() => {
        fireEvent.keyDown(document, { key: "ArrowUp" }); // wraps to last
      });

      const options = screen.getAllByRole("option");
      expect(document.activeElement).toBe(options[options.length - 1]);
    });

    it("Enter key triggers transfer for focused item", async () => {
      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      act(() => {
        fireEvent.keyDown(document, { key: "ArrowDown" }); // SSW (index 0)
      });

      act(() => {
        fireEvent.keyDown(document, { key: "Enter" });
      });

      await waitFor(() => {
        // SSW is first (sorted), NT is current room, so SSW should trigger transfer
        expect(mockTransferConsultRoom).toHaveBeenCalledWith(
          expect.any(String),
          "SSW",
          expect.any(Function)
        );
      });
    });

    it("Enter key does nothing when focusedIndex is -1", async () => {
      renderButton();
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));

      act(() => {
        fireEvent.keyDown(document, { key: "Enter" });
      });

      // Assert no transfer was triggered after handlers settle
      await waitFor(() => {
        expect(mockTransferConsultRoom).not.toHaveBeenCalled();
      });
    });

    it("Keyboard events are not active when dropdown is closed", () => {
      renderButton();
      // Do NOT open the dropdown
      act(() => {
        fireEvent.keyDown(document, { key: "ArrowDown" });
      });
      // No error, no dropdown
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Transferring state (loading spinner)
  // -------------------------------------------------------------------------
  describe("transferring state", () => {
    it("shows spinner while transfer is in progress", async () => {
      // Make the transfer hang
      let resolveTransfer!: (value: { transferred: boolean; backgroundPromise: null }) => void;
      mockTransferConsultRoom.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveTransfer = resolve;
        })
      );

      const { container } = renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      fireEvent.click(screen.getByRole("option", { name: /^SSW$/ }));

      // Spinner should appear
      await waitFor(() => {
        expect(container.querySelector('[class*="animate-spin"]')).toBeInTheDocument();
      });

      // Clean up
      act(() => {
        resolveTransfer({ transferred: true, backgroundPromise: null });
      });
    });

    it("disables the button while transferring", async () => {
      let resolveTransfer!: (value: { transferred: boolean; backgroundPromise: null }) => void;
      mockTransferConsultRoom.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveTransfer = resolve;
        })
      );

      renderButton({ currentRoom: "NT" });
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      fireEvent.click(screen.getByRole("option", { name: /^SSW$/ }));

      await waitFor(() => {
        expect(screen.getByTitle("เปลี่ยนห้อง")).toBeDisabled();
      });

      act(() => {
        resolveTransfer({ transferred: true, backgroundPromise: null });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Responsive resize alignment
  // -------------------------------------------------------------------------
  describe("portal positioning, viewport clamping & vertical flip-up", () => {
    it("renders listbox in document.body portal to escape overflow-auto Table View containers", () => {
      const { container } = render(
        <div className="overflow-auto max-h-[164px]">
          <RoomTransferButton consultId="test-consult-1" currentRoom="Urgent" />
        </div>
      );

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.parentElement).toBe(document.body);
      expect(container.contains(listbox)).toBe(false);
      expect(listbox.className).toContain("fixed");
    });

    it("recomputes fixed horizontal position on window resize while open", () => {
      const originalInnerWidth = window.innerWidth;
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 800 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 600 });

      const { container } = renderButton();
      const wrapper = container.firstElementChild as HTMLElement;
      let mockRight = 300;
      let mockLeft = 270;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: mockLeft,
        y: 100,
        width: 30,
        height: 30,
        top: 100,
        right: mockRight,
        bottom: 130,
        left: mockLeft,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      // Right-aligned: 300 - 160 = 140px
      expect(screen.getByRole("listbox").style.left).toBe("140px");

      // Shift trigger near left viewport edge so right-align would go negative -> falls back to left-align (20px)
      mockRight = 50;
      mockLeft = 20;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(screen.getByRole("listbox").style.left).toBe("20px");

      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: originalInnerHeight });
    });

    it("clamps horizontal placement within viewport when neither right nor left alignment fits", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 220 });

      const { container } = renderButton();
      const wrapper = container.firstElementChild as HTMLElement;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 100,
        y: 80,
        width: 22,
        height: 30,
        top: 80,
        right: 122,
        bottom: 110,
        left: 100,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      const listbox = screen.getByRole("listbox");
      Object.defineProperty(listbox, "offsetWidth", { configurable: true, value: 200 });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      // Clamped inside [8, 220 - 200 - 8] => 8px
      expect(listbox.style.left).toBe("8px");

      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalInnerWidth });
    });

    it("flips menu upward when bottom viewport space is insufficient", () => {
      const originalInnerWidth = window.innerWidth;
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 600 });

      const { container } = renderButton();
      const wrapper = container.firstElementChild as HTMLElement;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 400,
        y: 520,
        width: 30,
        height: 30,
        top: 520,
        right: 430,
        bottom: 550,
        left: 400,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.getAttribute("data-placement")).toBe("top");
      // 520 - 4 (gap) - 232 (fallback height) = 284px
      expect(listbox.style.top).toBe("284px");

      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: originalInnerHeight });
    });

    it("repositions on ancestor scroll (capture phase) while open and removes listener on close", () => {
      const originalInnerWidth = window.innerWidth;
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 800 });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 600 });

      const removeWindowSpy = vi.spyOn(window, "removeEventListener");
      const { container } = render(
        <div className="overflow-auto">
          <RoomTransferButton consultId="test-consult-1" currentRoom="NT" />
        </div>
      );
      const scrollContainer = container.firstElementChild as HTMLElement;
      const wrapper = scrollContainer.firstElementChild as HTMLElement;

      let mockTop = 100;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 400,
        y: mockTop,
        width: 30,
        height: 30,
        top: mockTop,
        right: 430,
        bottom: mockTop + 30,
        left: 400,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").style.top).toBe("134px");

      mockTop = 200;
      act(() => {
        scrollContainer.dispatchEvent(new Event("scroll"));
      });
      expect(screen.getByRole("listbox").style.top).toBe("234px");

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(removeWindowSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });

      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: originalInnerHeight });
    });

    it("clears open state when disabled so re-enabling keeps menu closed until clicked", () => {
      const { rerender } = render(
        <RoomTransferButton consultId="test-consult-1" currentRoom="NT" disabled={false} />
      );

      const trigger = screen.getByTitle("เปลี่ยนห้อง");
      fireEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      rerender(
        <RoomTransferButton consultId="test-consult-1" currentRoom="NT" disabled={true} />
      );
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      rerender(
        <RoomTransferButton consultId="test-consult-1" currentRoom="NT" disabled={false} />
      );
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });
});