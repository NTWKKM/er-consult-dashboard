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
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* Background aesthetic */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />

      <main className="relative z-10 w-full max-w-md">
        <div className="bg-gray-800/80 backdrop-blur-xl border border-gray-700/50 p-8 rounded-2xl shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">ER Consult</h1>
            <p className="text-gray-400 mt-2 text-sm">Dashboard Login</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="passcode" className="block text-sm font-medium text-gray-300 mb-2">
                Passcode
              </label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                placeholder="Enter passcode"
                autoComplete="off"
                required
              />
            </div>

            {error && (
              <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-sm text-red-400 text-center">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-red-900/20"
            >
              {isLoading ? "Authenticating..." : "Enter"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
