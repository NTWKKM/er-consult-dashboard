"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthorizedStaff, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [user, loading, pathname, router]);

  // If loading, show nothing or a spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
        <div aria-hidden="true" className="w-10 h-10 border-4 border-rule border-t-accent rounded-full motion-safe:animate-spin"></div>
        <p className="text-sm font-medium text-ink-2">กำลังตรวจสอบสิทธิ์…</p>
      </div>
    );
  }

  // If not logged in and not on login page, don't render children to prevent flashes
  if (!user && pathname !== "/login") {
    return null;
  }

  // Signed in without authorized staff claim or verified @mnrh.com email:
  // Block operational views cleanly and provide Sign Out so the station is never trapped.
  if (user && !isAuthorizedStaff && pathname !== "/login") {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-paper-2 border border-rule rounded-[10px] p-6 text-center">
          <h1 className="text-lg font-medium text-ink mb-2">บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงระบบ</h1>
          <p className="text-sm text-muted mb-5">
            กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วย Passcode เจ้าหน้าที่ที่ได้รับอนุญาต หรือติดต่อผู้ดูแลระบบ
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="px-4 py-2.5 rounded-[6px] bg-bad text-paper font-medium text-sm hover:opacity-90 transition-opacity tap-feedback"
          >
            ออกจากระบบ
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
