import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";

const mockLogout = vi.fn<() => Promise<void>>();
const mockAddToast = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "staff-1", email: "staff@mnrh.com" },
    logout: mockLogout,
  }),
}));

vi.mock("@/app/contexts/ToastContext", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/app/components/NavbarControls", () => ({
  default: () => <div data-testid="navbar-controls" />,
}));

vi.mock("@/app/components/ConnectionStatus", () => ({
  default: () => <div data-testid="connection-status" />,
}));

import Navbar from "@/app/components/Navbar";

describe("Navbar logout confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports logout error and keeps confirmation modal open when sign-out fails", async () => {
    mockLogout.mockRejectedValueOnce(new Error("signOut failed"));

    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "ออกจากระบบ" }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("signOut failed"),
        })
      );
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes confirmation modal when logout resolves cleanly", async () => {
    mockLogout.mockResolvedValueOnce(undefined);

    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "ออกจากระบบ" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockAddToast).not.toHaveBeenCalled();
  });
});
