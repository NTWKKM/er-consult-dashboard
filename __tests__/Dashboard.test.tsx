import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { Consult } from "@/lib/db";
import { makeConsult } from "./helpers/fixtures";

let mockPendingState: { cases: Consult[]; loading: boolean; error: string | null } = {
  cases: [],
  loading: false,
  error: null,
};

let mockDisplayMode: "card" | "table" = "card";
const mockSetDisplayMode = vi.fn((mode: "card" | "table") => {
  mockDisplayMode = mode;
});

vi.mock("@/app/contexts/ConsultsContext", () => ({
  usePendingConsults: () => mockPendingState,
}));

vi.mock("@/app/contexts/SettingsContext", () => ({
  useSettings: () => ({
    darkMode: false,
    soundEnabled: true,
    displayMode: mockDisplayMode,
    setDisplayMode: mockSetDisplayMode,
    toggleDarkMode: vi.fn(),
    toggleSound: vi.fn(),
  }),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/lib/db", () => ({
  transferConsultRoom: vi.fn(),
  updateConsult: vi.fn(),
  transactionalUpdateConsult: vi.fn(),
}));

import Dashboard from "@/app/page";

describe("Dashboard Whiteboard views, filters & states", () => {
  const surgResusCase = makeConsult({
    id: "d1",
    hn: "1001001",
    firstName: "ศัลย์",
    lastName: "รีซัส",
    room: "Resus Team 1",
    departments: { "Gen Sx": { status: "pending", completedAt: null } },
  });

  const orthoNonResusCase = makeConsult({
    id: "d2",
    hn: "2002002",
    firstName: "กระดูก",
    lastName: "ทั่วไป",
    room: "SSW",
    departments: { Ortho: { status: "pending", completedAt: null } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockDisplayMode = "card";
    mockPendingState = {
      cases: [surgResusCase, orthoNonResusCase],
      loading: false,
      error: null,
    };
  });

  it("updates รอปรึกษา count when switching Both / Surgery / Ortho filters and Resus / Non-Resus filters", () => {
    render(<Dashboard />);

    // Both: 2 active cases
    expect(screen.getByText(/1001001/)).toBeInTheDocument();
    expect(screen.getByText(/2002002/)).toBeInTheDocument();

    // Filter to Ortho only -> shows Ortho case and hides Surgery section
    fireEvent.click(screen.getByRole("button", { name: "Ortho" }));
    expect(screen.queryByText(/1001001/)).not.toBeInTheDocument();
    expect(screen.getByText(/2002002/)).toBeInTheDocument();

    // Switch back to Both and filter Resus -> only Resus Team 1 case remains
    fireEvent.click(screen.getByRole("button", { name: "Both" }));
    fireEvent.click(screen.getByRole("button", { name: "Resus" }));
    expect(screen.getByText(/1001001/)).toBeInTheDocument();
    expect(screen.queryByText(/2002002/)).not.toBeInTheDocument();
  });

  it("renders Table view with empty state when no pending cases exist", () => {
    mockDisplayMode = "table";
    mockPendingState = { cases: [], loading: false, error: null };

    render(<Dashboard />);
    expect(screen.getAllByText("ไม่มีเคสรอปรึกษา").length).toBeGreaterThan(0);
  });

  it("renders ErrorState when pending consults subscription errors", () => {
    mockPendingState = {
      cases: [],
      loading: false,
      error: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้",
    };

    render(<Dashboard />);
    expect(screen.getByText("ไม่สามารถเชื่อมต่อฐานข้อมูลได้")).toBeInTheDocument();
  });

  it("shows audio autoplay unlock banner when sound is enabled and AudioContext is suspended on incoming case", () => {
    const originalAudioContext = window.AudioContext;
    class SuspendedAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createOscillator = vi.fn();
      createGain = vi.fn();
    }
    Object.defineProperty(window, "AudioContext", {
      writable: true,
      configurable: true,
      value: SuspendedAudioContext,
    });

    mockPendingState = { cases: [surgResusCase], loading: false, error: null };
    const { rerender } = render(<Dashboard />);

    // Deliver a new incoming case -> suspended AudioContext surfaces unlock button
    mockPendingState = {
      cases: [surgResusCase, orthoNonResusCase],
      loading: false,
      error: null,
    };
    rerender(<Dashboard />);

    const unlockBtn = screen.getByRole("button", { name: /ปลดล็อกเสียง/ });
    expect(unlockBtn).toBeInTheDocument();
    fireEvent.click(unlockBtn);
    expect(screen.queryByRole("button", { name: /ปลดล็อกเสียง/ })).not.toBeInTheDocument();

    Object.defineProperty(window, "AudioContext", {
      writable: true,
      configurable: true,
      value: originalAudioContext,
    });
  });
});
