"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!auth) {
        throw new Error("Firebase Auth is not configured");
      }

      const email = `${passcode}@mnrh.com`;
      // By standard, we use the passcode itself or a fixed pattern as password to reduce friction
      const password = passcode; 
      
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: unknown) {
      console.error("Login failed:", err instanceof Error ? err.message : "unknown");
      setError("Passcode ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง");
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
              disabled={isLoading}
              className="w-full bg-accent hover:opacity-90 text-accent-ink font-medium py-3 px-4 rounded-[6px] transition-opacity duration-200 disabled:opacity-50 tap-feedback whitespace-nowrap"
            >
              {isLoading ? "Authenticating…" : "Enter"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
