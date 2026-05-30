"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
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
      <div className="min-h-screen bg-[#014167] dark:bg-gray-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  // If not logged in and not on login page, don't render children to prevent flashes
  if (!user && pathname !== "/login") {
    return null;
  }

  return <>{children}</>;
}
