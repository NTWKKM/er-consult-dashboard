import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { ElapsedTime } from "@/app/components/ElapsedTime";

// ---------------------------------------------------------------------------
// Helpers for controlling the current time
// ---------------------------------------------------------------------------

const BASE_TIME = new Date("2024-01-15T10:00:00.000Z").getTime();

function setNow(ms: number) {
  vi.setSystemTime(new Date(ms));
}

/**
 * Returns an ISO string that is `minutesAgo` minutes before BASE_TIME.
 */
function createdAt(minutesAgo: number): string {
  return new Date(BASE_TIME - minutesAgo * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ElapsedTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNow(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Rendering basics
  // -------------------------------------------------------------------------
  describe("display text", () => {
    it("shows elapsed minutes when under an hour", () => {
      render(<ElapsedTime createdAt={createdAt(45)} />);
      expect(screen.getByText(/รอ/)).toBeInTheDocument();
      expect(screen.getByText(/45 นาที/)).toBeInTheDocument();
    });

    it("shows 0 นาที for a brand-new consult", () => {
      render(<ElapsedTime createdAt={createdAt(0)} />);
      expect(screen.getByText(/รอ/)).toBeInTheDocument();
      expect(screen.getByText(/0 นาที/)).toBeInTheDocument();
    });

    it("shows hours and minutes when over an hour", () => {
      render(<ElapsedTime createdAt={createdAt(90)} />);
      expect(screen.getByText(/1 ชม. 30 นาที/)).toBeInTheDocument();
    });

    it("shows hours and zero remaining minutes", () => {
      render(<ElapsedTime createdAt={createdAt(120)} />);
      expect(screen.getByText(/2 ชม. 0 นาที/)).toBeInTheDocument();
    });

    it("shows multiple hours correctly", () => {
      render(<ElapsedTime createdAt={createdAt(185)} />);
      expect(screen.getByText(/3 ชม. 5 นาที/)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Color escalation classes
  // -------------------------------------------------------------------------
  describe("escalation CSS classes", () => {
    it("applies elapsed-safe class for < 90 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(30)} />
      );
      expect(container.querySelector(".elapsed-safe")).toBeInTheDocument();
    });

    it("applies elapsed-safe class at exactly 0 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(0)} />
      );
      expect(container.querySelector(".elapsed-safe")).toBeInTheDocument();
    });

    it("applies elapsed-safe class at 89 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(89)} />
      );
      expect(container.querySelector(".elapsed-safe")).toBeInTheDocument();
    });

    it("applies elapsed-warning class at exactly 90 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(90)} />
      );
      expect(container.querySelector(".elapsed-warning")).toBeInTheDocument();
    });

    it("applies elapsed-warning class at 120 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(120)} />
      );
      expect(container.querySelector(".elapsed-warning")).toBeInTheDocument();
    });

    it("applies elapsed-warning class at exactly 150 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(150)} />
      );
      expect(container.querySelector(".elapsed-warning")).toBeInTheDocument();
    });

    it("applies elapsed-danger class at 151 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(151)} />
      );
      expect(container.querySelector(".elapsed-danger")).toBeInTheDocument();
    });

    it("applies elapsed-danger class at 240 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(240)} />
      );
      expect(container.querySelector(".elapsed-danger")).toBeInTheDocument();
    });

    it("applies elapsed-critical class at 241 minutes", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(241)} />
      );
      expect(container.querySelector(".elapsed-critical")).toBeInTheDocument();
    });

    it("applies elapsed-critical class for very long waits (300 minutes)", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(300)} />
      );
      expect(container.querySelector(".elapsed-critical")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Interval updates
  // -------------------------------------------------------------------------
  describe("interval-based updates", () => {
    it("updates elapsed time after one minute interval", () => {
      render(<ElapsedTime createdAt={createdAt(59)} />);
      expect(screen.getByText(/59 นาที/)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(screen.getByText(/1 ชม. 0 นาที/)).toBeInTheDocument();
    });

    it("clears the interval on unmount (no errors after unmount)", () => {
      const { unmount } = render(
        <ElapsedTime createdAt={createdAt(10)} />
      );
      unmount();
      // Advancing time after unmount should not throw
      expect(() => act(() => vi.advanceTimersByTime(120_000))).not.toThrow();
    });

    it("escalation class updates after time advances past 90 minutes", () => {
      // Start at 89 minutes (safe)
      const { container } = render(
        <ElapsedTime createdAt={createdAt(89)} />
      );
      expect(container.querySelector(".elapsed-safe")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(60_000); // +1 minute = 90 minutes
      });

      expect(container.querySelector(".elapsed-warning")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Clock icon
  // -------------------------------------------------------------------------
  describe("clock icon", () => {
    it("renders an SVG icon", () => {
      const { container } = render(
        <ElapsedTime createdAt={createdAt(30)} />
      );
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // basic render (structural check only — CSS loaded separately)
  // -------------------------------------------------------------------------
  describe("basic render", () => {
    it("renders without error in dark mode", () => {
      expect(() =>
        render(<ElapsedTime createdAt={createdAt(30)} />)
      ).not.toThrow();
    });
  });
});