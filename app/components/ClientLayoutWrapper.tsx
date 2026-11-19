"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import BottomNav from "./BottomNav";
import { ConsultsProvider } from "../contexts/ConsultsContext";
import { useToast } from "../contexts/ToastContext";
import { monitorReloadedPendingSubmitDrafts } from "@/lib/db";

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const { addToast } = useToast();

  useEffect(() => {
    if (isLoginPage) return;
    return monitorReloadedPendingSubmitDrafts((failedDraft) => {
      addToast({
        type: "error",
        message: `ซิงค์เคส HN: ${failedDraft.hn} ไม่สำเร็จ กรุณากลับไปหน้า "ส่งเคสปรึกษา" เพื่อลองส่งใหม่`,
        duration: 6000,
      });
    });
  }, [isLoginPage, addToast]);

  if (isLoginPage) {
    return <main>{children}</main>;
  }

  return (
    <ConsultsProvider>
      <div id="app-shell-root" data-app-shell="true">
        <Navbar />
        <main className="pb-20 lg:pb-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </ConsultsProvider>
  );
}
