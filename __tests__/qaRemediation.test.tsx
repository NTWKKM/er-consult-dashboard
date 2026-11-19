import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { MilestoneList } from "@/app/components/MilestoneList";
import { ElapsedTime } from "@/app/components/ElapsedTime";
import { buildCompletedExportRows } from "@/lib/excelExport";
import { makeConsult } from "./helpers/fixtures";

const mockPush = vi.fn();
const mockLogout = vi.fn();
let mockAuthState = {
  user: null as { uid: string; email?: string } | null,
  loading: false,
  isAuthorizedStaff: false,
  logout: mockLogout,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}));

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

import ProtectedRoute from "@/app/components/ProtectedRoute";

describe("QA Remediation Regressions (Sprints 1-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      user: null,
      loading: false,
      isAuthorizedStaff: false,
      logout: mockLogout,
    };
  });

  describe("MilestoneList +N overflow indicator", () => {
    it("displays +N badge with full trail tooltip when department has > 3 milestones", () => {
      render(
        <MilestoneList
          isAccepted={true}
          dept={{
            status: "pending",
            completedAt: null,
            acceptedAt: "2026-11-19T06:00:00.000Z",
            admittedAt: "2026-11-19T06:10:00.000Z",
            returnedAt: "2026-11-19T06:20:00.000Z",
            dischargedAt: "2026-11-19T06:30:00.000Z",
            transfers: [{ to: "Urgent", at: "2026-11-19T05:55:00.000Z" }],
          }}
        />
      );

      const badge = screen.getByText("+2");
      expect(badge).toBeInTheDocument();
      expect(badge.getAttribute("title")).toContain("ย้าย Urgent");
      expect(badge.getAttribute("title")).toContain("รับ");
      expect(badge.getAttribute("title")).toContain("D/C");
    });

    it("does NOT show +N badge when 3 or fewer milestones exist", () => {
      render(
        <MilestoneList
          isAccepted={true}
          dept={{
            status: "pending",
            completedAt: null,
            acceptedAt: "2026-11-19T06:00:00.000Z",
            admittedAt: "2026-11-19T06:10:00.000Z",
          }}
        />
      );

      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });
  });

  describe("ElapsedTime createdAt prop reactivity", () => {
    it("updates displayed wait time immediately when createdAt prop changes (e.g. Re-consult)", () => {
      const twoHoursAgo = new Date(Date.now() - 125 * 60 * 1000).toISOString();
      const justNow = new Date().toISOString();

      const { rerender } = render(<ElapsedTime createdAt={twoHoursAgo} />);
      expect(screen.getByText(/รอ 2 ชม\. 5 นาที/)).toBeInTheDocument();

      rerender(<ElapsedTime createdAt={justNow} />);
      expect(screen.getByText(/รอ 0 นาที/)).toBeInTheDocument();
    });
  });

  describe("excelExport department formula sanitization", () => {
    it("sanitizes leading formula characters in department keys while keeping empty dashes unescaped", () => {
      const consult = makeConsult({
        id: "exp-1",
        hn: "123456",
        firstName: "Test",
        lastName: "Patient",
        problem: "+ve FAST",
        departments: {
          "=HYPERLINK(\"http://evil\")": {
            status: "completed",
            acceptedAt: "2026-11-19T06:00:00.000Z",
            completedAt: "2026-11-19T06:30:00.000Z",
          },
        },
      });

      const [row] = buildCompletedExportRows([consult]);
      expect(row.แผนก.startsWith("'=")).toBe(true);
      expect(row.รับเคส.startsWith("'=")).toBe(true);
      expect(row.ปิดเคส.startsWith("'=")).toBe(true);
      expect(row.Admit).toBe("-");
      expect(row.ยกเลิก).toBe("-");
    });
  });

  describe("ProtectedRoute authorized staff enforcement & logout escape hatch", () => {
    it("blocks signed-in user lacking authorized staff claim and exposes logout button", () => {
      mockAuthState = {
        user: { uid: "unauth-1", email: "guest@example.com" },
        loading: false,
        isAuthorizedStaff: false,
        logout: mockLogout,
      };

      render(
        <ProtectedRoute>
          <div>Sensitive Whiteboard</div>
        </ProtectedRoute>
      );

      expect(screen.queryByText("Sensitive Whiteboard")).not.toBeInTheDocument();
      const logoutBtn = screen.getByRole("button", { name: "ออกจากระบบ" });
      fireEvent.click(logoutBtn);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it("renders children for authorized staff", () => {
      mockAuthState = {
        user: { uid: "staff-1", email: "er@mnrh.com" },
        loading: false,
        isAuthorizedStaff: true,
        logout: mockLogout,
      };

      render(
        <ProtectedRoute>
          <div>Sensitive Whiteboard</div>
        </ProtectedRoute>
      );

      expect(screen.getByText("Sensitive Whiteboard")).toBeInTheDocument();
    });
  });
});
