"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import BottomNav from "./BottomNav";

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <main>{children}</main>;
  }

  return (
    <div id="app-shell-root" data-app-shell="true">
      <Navbar />
      <main className="pb-20 lg:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
