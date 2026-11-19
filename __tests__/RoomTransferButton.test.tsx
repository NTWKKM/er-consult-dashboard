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
        expect(container.querySelector(".animate-spin")).toBeInTheDocument();
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
  describe("responsive resize alignment", () => {
    it("recomputes listbox alignment on window resize while open", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 800,
      });

      const { container } = renderButton();
      const wrapper = container.firstElementChild as HTMLElement;
      let mockRight = 300;
      let mockLeft = 270;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: mockLeft,
        y: 0,
        width: 30,
        height: 30,
        top: 0,
        right: mockRight,
        bottom: 30,
        left: mockLeft,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").className).toContain("right-0");

      // Simulate viewport/anchor shift so right-0 would clip off the left edge
      mockRight = 50;
      mockLeft = 20;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(screen.getByRole("listbox").className).toContain("left-0");

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it("prefers left-0 when only left-0 fits menuWidth without the 8px margin, and keeps right-0 when both fit", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 200,
      });

      const { container } = renderButton();
      const wrapper = container.firstElementChild as HTMLElement;
      // Fallback menuWidth is 160px (requiredWidth = 168px).
      // When right = 150 (< 160) and left = 36 (36 + 160 = 196 <= 200, even though 36 + 168 = 204 > 200),
      // only left-0 fits the menu itself so left-0 should be selected.
      let mockRight = 150;
      let mockLeft = 36;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: mockLeft,
        y: 0,
        width: 114,
        height: 30,
        top: 0,
        right: mockRight,
        bottom: 30,
        left: mockLeft,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").className).toContain("left-0");

      // When both anchors fit menuWidth and requiredWidth, right-0 is kept.
      mockRight = 180;
      mockLeft = 10;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(screen.getByRole("listbox").className).toContain("right-0");

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it("uses the nearest overflow-clipping ancestor bounds when computing left-0 vs right-0", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        <div data-testid="scroll-container" className="overflow-x-auto">
          <RoomTransferButton consultId="test-consult-1" currentRoom="NT" />
        </div>
      );

      const scrollContainer = container.firstElementChild as HTMLElement;
      const wrapper = scrollContainer.firstElementChild as HTMLElement;
      vi.spyOn(scrollContainer, "getBoundingClientRect").mockImplementation(() => ({
        x: 200,
        y: 0,
        width: 500,
        height: 400,
        top: 0,
        right: 700,
        bottom: 400,
        left: 200,
        toJSON: () => ({}),
      }));
      // In window coordinates right=250 >= 160, but relative to scrollContainer.left (200),
      // right-0 would clip past 200 (250 - 160 = 90 < 200) while left-0 fits inside [200, 700].
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 220,
        y: 0,
        width: 30,
        height: 30,
        top: 0,
        right: 250,
        bottom: 30,
        left: 220,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").className).toContain("left-0");

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it("clamps horizontal menu placement within viewport when neither anchor fits", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 320,
      });

      const { container } = renderButton();
      const wrapper = container.firstElementChild as HTMLElement;
      // Menu fallback width is 160px; mock rendered listbox width to 200px during open resize.
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 145,
        y: 0,
        width: 22,
        height: 30,
        top: 0,
        right: 167,
        bottom: 30,
        left: 145,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      const listbox = screen.getByRole("listbox");
      Object.defineProperty(listbox, "offsetWidth", {
        configurable: true,
        value: 200,
      });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      // With menuWidth=200 and trigger x=145..167 in a 320px viewport,
      // clamping places left edge at viewport x=0 (offset -145px from trigger.left=145).
      expect(listbox.style.left).toBe("-145px");
      expect(listbox.style.right).toBe("auto");

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it("uses scrollable clientWidth excluding scrollbar so right-0 wins when menu would overflow into scrollbar", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        <div className="overflow-x-auto">
          <RoomTransferButton consultId="test-consult-1" currentRoom="NT" />
        </div>
      );

      const innerScroll = container.firstElementChild as HTMLElement;
      const wrapper = innerScroll.firstElementChild as HTMLElement;

      // Scroll container rect spans x=200..510, while clientWidth=290 limits scrollport to x=200..490 (20px scrollbar).
      // At trigger x=335..365 (menuWidth=160, requiredWidth=168):
      // - Ignoring clientWidth ([200, 510]) fails right margin (365-168=197 < 200) and picks left-0 (335+168=503 <= 510).
      // - Using clientWidth ([200, 490]) rejects left-0 (335+160=495 > 490) and picks right-0 (365-160=205 >= 200).
      vi.spyOn(innerScroll, "getBoundingClientRect").mockImplementation(() => ({
        x: 200,
        y: 0,
        width: 310,
        height: 400,
        top: 0,
        right: 510,
        bottom: 400,
        left: 200,
        toJSON: () => ({}),
      }));
      Object.defineProperty(innerScroll, "clientWidth", {
        configurable: true,
        value: 290,
      });
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 335,
        y: 0,
        width: 30,
        height: 30,
        top: 0,
        right: 365,
        bottom: 30,
        left: 335,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").className).toContain("right-0");

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it("intersects nested clipping ancestors when outer container narrows effective bounds", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <RoomTransferButton consultId="test-consult-1" currentRoom="NT" />
          </div>
        </div>
      );

      const outerContainer = container.firstElementChild as HTMLElement;
      const innerScroll = outerContainer.firstElementChild as HTMLElement;
      const wrapper = innerScroll.firstElementChild as HTMLElement;

      // Inner clips x=232..700 (clientWidth=468); outer narrows right edge to x=100..400 -> shared interval [232, 400].
      // At trigger x=365..395 (menuWidth=160, requiredWidth=168):
      // - Ignoring outer ([232, 700]) fails right margin (395-168=227 < 232) and picks left-0 (365+168=533 <= 700).
      // - Intersecting outer ([232, 400]) rejects left-0 (365+160=525 > 400) and picks right-0 (395-160=235 >= 232).
      vi.spyOn(outerContainer, "getBoundingClientRect").mockImplementation(() => ({
        x: 100,
        y: 0,
        width: 300,
        height: 400,
        top: 0,
        right: 400,
        bottom: 400,
        left: 100,
        toJSON: () => ({}),
      }));
      vi.spyOn(innerScroll, "getBoundingClientRect").mockImplementation(() => ({
        x: 232,
        y: 0,
        width: 468,
        height: 400,
        top: 0,
        right: 700,
        bottom: 400,
        left: 232,
        toJSON: () => ({}),
      }));
      Object.defineProperty(innerScroll, "clientWidth", {
        configurable: true,
        value: 468,
      });
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: 365,
        y: 0,
        width: 30,
        height: 30,
        top: 0,
        right: 395,
        bottom: 30,
        left: 365,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").className).toContain("right-0");

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });

    it("recalculates placement when a clipping ancestor scrolls while open and removes listener on close", () => {
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 800,
      });

      const { container } = render(
        <div className="overflow-x-auto">
          <RoomTransferButton consultId="test-consult-1" currentRoom="NT" />
        </div>
      );
      const scrollContainer = container.firstElementChild as HTMLElement;
      const wrapper = scrollContainer.firstElementChild as HTMLElement;
      const removeSpy = vi.spyOn(scrollContainer, "removeEventListener");

      vi.spyOn(scrollContainer, "getBoundingClientRect").mockImplementation(() => ({
        x: 200,
        y: 0,
        width: 400,
        height: 400,
        top: 0,
        right: 600,
        bottom: 400,
        left: 200,
        toJSON: () => ({}),
      }));

      let mockLeft = 400;
      let mockRight = 430;
      vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => ({
        x: mockLeft,
        y: 0,
        width: 30,
        height: 30,
        top: 0,
        right: mockRight,
        bottom: 30,
        left: mockLeft,
        toJSON: () => ({}),
      }));

      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(screen.getByRole("listbox").className).toContain("right-0");

      // Scroll container rightwards so trigger moves near container left edge (210..240)
      mockLeft = 210;
      mockRight = 240;
      act(() => {
        scrollContainer.dispatchEvent(new Event("scroll"));
      });
      expect(screen.getByRole("listbox").className).toContain("left-0");

      // Closing removes scroll listener
      fireEvent.click(screen.getByTitle("เปลี่ยนห้อง"));
      expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));

      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
    });
  });
});