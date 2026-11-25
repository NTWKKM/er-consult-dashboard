import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: null,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ type: "collection" })),
  doc: vi.fn((_db: unknown, _col: string, id?: string) => ({ id: id ?? "doc-1" })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((...args: unknown[]) => args[0]),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "staff-1", email: "er@mnrh.com", emailVerified: true },
    loading: false,
    isAuthorizedStaff: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/app/contexts/SettingsContext", () => ({
  useSettings: () => ({
    darkMode: false,
    soundEnabled: true,
    displayMode: "card" as const,
    dashboardView: "both" as const,
    roomFilter: "all" as const,
    setDisplayMode: vi.fn(),
    setDashboardView: vi.fn(),
    setRoomFilter: vi.fn(),
    toggleDarkMode: vi.fn(),
    toggleSound: vi.fn(),
  }),
}));

import { ToastProvider } from "@/app/contexts/ToastContext";
import ClientLayoutWrapper from "@/app/components/ClientLayoutWrapper";

describe("ClientLayoutWrapper shell & PHI boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
    window.sessionStorage.clear();
  });

  it("renders app shell with navigation on operational routes and never persists PHI to sessionStorage", () => {
    render(
      <ToastProvider>
        <ClientLayoutWrapper>
          <div>Dashboard Page</div>
        </ClientLayoutWrapper>
      </ToastProvider>
    );

    expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
    expect(document.getElementById("app-shell-root")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("er_consult_submit_drafts_v1")).toBeNull();
  });

  it("omits app shell navigation on /login", () => {
    mockPathname = "/login";
    render(
      <ToastProvider>
        <ClientLayoutWrapper>
          <div>Login Form</div>
        </ClientLayoutWrapper>
      </ToastProvider>
    );

    expect(screen.getByText("Login Form")).toBeInTheDocument();
    expect(document.getElementById("app-shell-root")).toBeNull();
  });
});
