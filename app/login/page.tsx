"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

function getAuthErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err && typeof err.code === "string") {
    return err.code;
  }
  return "";
}

function getLoginErrorMessage(err: unknown): string {
  const code = getAuthErrorCode(err);
  const message = err instanceof Error ? err.message : "";
  const combined = `${code} ${message}`.toLowerCase();

  if (
    combined.includes("api-key-not-valid") ||
    combined.includes("invalid-api-key") ||
    combined.includes("requests-from-referer") ||
    code === "auth/app-not-authorized" ||
    code === "auth/unauthorized-domain" ||
    code === "auth/operation-not-allowed"
  ) {
    return "การตั้งค่า Firebase ไม่ถูกต้องหรือยังไม่ได้ Redeploy หลังอัปเดต Environment Variables กรุณาตรวจสอบและ Redeploy บน Vercel";
  }

  if (code === "auth/network-request-failed") {
    return "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต";
  }

  if (code === "auth/too-many-requests") {
    return "มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }

  if (code === "auth/user-disabled") {
    return "บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
  }

  return "Passcode ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง";
}

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user, loading, isPendingCleanup } = useAuth();

  useEffect(() => {
    if (!loading && user && !isPendingCleanup) {
      router.push("/");
    }
  }, [user, loading, isPendingCleanup, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isPendingCleanup) {
      setError("กำลังล้างข้อมูลเซสชันก่อนหน้า กรุณารอสักครู่");
      return;
    }
    setIsLoading(true);

    if (!auth) {
      console.error(
        "Sign-in unavailable: missing NEXT_PUBLIC_FIREBASE_API_KEY or NEXT_PUBLIC_FIREBASE_PROJECT_ID."
      );
      setError("ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน กรุณาตรวจสอบการตั้งค่าระบบ");
      setIsLoading(false);
      return;
    }

    const normalizedPasscode = passcode.trim().replace(/@mnrh\.com$/i, "");
    if (!normalizedPasscode) {
      setError("กรุณากรอก Passcode");
      setIsLoading(false);
      return;
    }

    try {
      const email = `${normalizedPasscode}@mnrh.com`;
      // By standard, we use the passcode itself or a fixed pattern as password to reduce friction
      const password = normalizedPasscode;

      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      console.error("Login failed:", code || (err instanceof Error ? err.message : "unknown"));
      setError(getLoginErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || user) return null; // Avoid flashing login screen if authenticated

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-4">
      <main className="w-full max-w-md">
        <div className="bg-paper-2 border border-rule p-8 rounded-[10px]">
          <div className="mb-8 pb-6 border-b border-rule">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-[6px] bg-bad text-paper flex items-center justify-center shrink-0">
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-medium text-ink tracking-tight">ER Consult</h1>
                <p className="text-muted text-xs measured">MNRH Clinical Whiteboard</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="passcode" className="block text-sm font-medium text-ink-2 mb-2">
                Passcode
              </label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-paper-3 border border-rule-2 rounded-[6px] px-4 py-3 text-ink placeholder-muted measured focus:outline-none focus:ring-2 focus:ring-focus focus:border-focus transition-colors duration-200"
                placeholder="Enter passcode"
                autoComplete="off"
                required
              />
            </div>

            {error && (
              <div role="alert" className="bg-bad-soft border border-bad/40 rounded-[6px] p-3">
                <p className="text-sm text-bad text-center font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isPendingCleanup}
              className="w-full bg-accent hover:opacity-90 text-accent-ink font-medium py-3 px-4 rounded-[6px] transition-opacity duration-200 disabled:opacity-50 tap-feedback whitespace-nowrap"
            >
              {isPendingCleanup ? "กำลังล้างข้อมูลเซสชัน…" : isLoading ? "Authenticating…" : "Enter"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
