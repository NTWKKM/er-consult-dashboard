import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// ConnectionStatus uses useSyncExternalStore with navigator.onLine.
// We need to control navigator.onLine via Object.defineProperty.
// ---------------------------------------------------------------------------
function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    writable: true,
    configurable: true,
    value,
  });
}

// Import the component AFTER setting up navigator stubs
import ConnectionStatus from "@/app/components/ConnectionStatus";

describe("ConnectionStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Online state
  // -------------------------------------------------------------------------
  describe("when navigator.onLine is true", () => {
    beforeEach(() => {
      setNavigatorOnline(true);
    });

    it("renders 'LIVE' label", () => {
      render(<ConnectionStatus />);
      expect(screen.getByText("LIVE")).toBeInTheDocument();
    });

    it("does NOT render 'OFFLINE' label", () => {
      render(<ConnectionStatus />);
      expect(screen.queryByText("OFFLINE")).not.toBeInTheDocument();
    });

    it("shows the green dot indicator", () => {
      const { container } = render(<ConnectionStatus />);
      const dot = container.querySelector(".bg-green-500");
      expect(dot).toBeInTheDocument();
    });

    it("shows the ping animation span", () => {
      const { container } = render(<ConnectionStatus />);
      const ping = container.querySelector(".animate-ping");
      expect(ping).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Offline state
  // -------------------------------------------------------------------------
  describe("when navigator.onLine is false", () => {
    beforeEach(() => {
      setNavigatorOnline(false);
    });

    it("renders 'OFFLINE' label", () => {
      render(<ConnectionStatus />);
      expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    });

    it("does NOT render 'LIVE' label", () => {
      render(<ConnectionStatus />);
      expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    });

    it("shows the red dot indicator", () => {
      const { container } = render(<ConnectionStatus />);
      const dot = container.querySelector(".bg-red-500");
      expect(dot).toBeInTheDocument();
    });

    it("does NOT show the ping animation", () => {
      const { container } = render(<ConnectionStatus />);
      const ping = container.querySelector(".animate-ping");
      expect(ping).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Reactive updates via online/offline events
  // -------------------------------------------------------------------------
  describe("reacts to browser online/offline events", () => {
    it("switches from LIVE to OFFLINE when 'offline' event fires", () => {
      setNavigatorOnline(true);
      render(<ConnectionStatus />);
      expect(screen.getByText("LIVE")).toBeInTheDocument();

      setNavigatorOnline(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    });

    it("switches from OFFLINE to LIVE when 'online' event fires", () => {
      setNavigatorOnline(false);
      render(<ConnectionStatus />);
      expect(screen.getByText("OFFLINE")).toBeInTheDocument();

      setNavigatorOnline(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      expect(screen.getByText("LIVE")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Label/dotColor logic validation (pure derivation from isOnline)
  // -------------------------------------------------------------------------
  describe("dot color logic", () => {
    it("grey dot is absent when online", () => {
      setNavigatorOnline(true);
      const { container } = render(<ConnectionStatus />);
      expect(container.querySelector(".bg-gray-400")).not.toBeInTheDocument();
    });

    it("grey dot is absent when offline", () => {
      setNavigatorOnline(false);
      const { container } = render(<ConnectionStatus />);
      expect(container.querySelector(".bg-gray-400")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Structural rendering
  // -------------------------------------------------------------------------
  describe("renders the wrapper element with expected classes", () => {
    it("has backdrop-blur-sm class on wrapper", () => {
      setNavigatorOnline(true);
      const { container } = render(<ConnectionStatus />);
      expect(container.querySelector(".backdrop-blur-sm")).toBeInTheDocument();
    });

    it("always renders a span for the dot", () => {
      setNavigatorOnline(true);
      const { container } = render(<ConnectionStatus />);
      const dotSpan = container.querySelector(".relative.flex.h-2.w-2");
      expect(dotSpan).toBeInTheDocument();
    });
  });
});