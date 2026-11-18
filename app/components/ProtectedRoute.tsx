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
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-rule border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If not logged in and not on login page, don't render children to prevent flashes
  if (!user && pathname !== "/login") {
    return null;
  }

  return <>{children}</>;
}
