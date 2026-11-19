import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import type { Consult } from "@/lib/db";
import { makeConsult } from "./helpers/fixtures";

let capturedOnData: ((consults: Consult[]) => void) | null = null;

vi.mock("@/lib/db", () => ({
  subscribeToConsultsByStatus: vi.fn(
    (_status: string, onData: (consults: Consult[]) => void) => {
      capturedOnData = onData;
      return vi.fn();
    }
  ),
  transferConsultRoom: vi.fn(),
  updateConsult: vi.fn(),
  transactionalUpdateConsult: vi.fn(),
}));

vi.mock("@/app/contexts/SettingsContext", () => ({
  useSettings: () => ({
    darkMode: false,
    soundEnabled: true,
    displayMode: "card" as const,
    setDisplayMode: vi.fn(),
    toggleDarkMode: vi.fn(),
    toggleSound: vi.fn(),
  }),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "staff-1", email: "er@mnrh.com", emailVerified: true },
    loading: false,
    isAuthorizedStaff: true,
    logout: vi.fn(),
  }),
}));

import { ConsultsProvider } from "@/app/contexts/ConsultsContext";
import Dashboard from "@/app/page";

describe("Dashboard new-case sound alert (regression B2)", () => {
  let startSpy: ReturnType<typeof vi.fn>;
  let closeSpy: ReturnType<typeof vi.fn>;
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    capturedOnData = null;
    startSpy = vi.fn();
    closeSpy = vi.fn().mockResolvedValue(undefined);

    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      close = closeSpy;
      createOscillator = vi.fn(() => ({
        connect: vi.fn(),
        frequency: { value: 0 },
        type: "sine",
        start: startSpy,
        stop: vi.fn(),
      }));
      createGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      }));
    }

    Object.defineProperty(window, "AudioContext", {
      writable: true,
      configurable: true,
      value: FakeAudioContext,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "AudioContext", {
      writable: true,
      configurable: true,
      value: originalAudioContext,
    });
  });

  it("does NOT beep on initial snapshot load, then beeps once when a new case arrives, and closes AudioContext on unmount", () => {
    const { unmount } = render(
      <ConsultsProvider>
        <Dashboard />
      </ConsultsProvider>
    );
    expect(capturedOnData).not.toBeNull();

    // First snapshot delivers 2 existing cases -> must NOT trigger alarm
    const existing1 = makeConsult({ id: "c1", hn: "100001" });
    const existing2 = makeConsult({ id: "c2", hn: "100002" });
    act(() => {
      capturedOnData!([existing1, existing2]);
    });
    expect(startSpy).not.toHaveBeenCalled();

    // Subsequent snapshot adds 1 brand-new case -> triggers 3-beep alert sequence
    const incoming = makeConsult({ id: "c3", hn: "100003" });
    act(() => {
      capturedOnData!([existing1, existing2, incoming]);
    });
    expect(startSpy).toHaveBeenCalledTimes(3);

    // Unmount closes AudioContext cleanly (B13)
    unmount();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
