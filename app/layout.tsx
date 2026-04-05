import type { Metadata } from "next";
import "./globals.css";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ToastProvider } from "./contexts/ToastContext";
import Navbar from "./components/Navbar";
import BottomNav from "./components/BottomNav";

export const metadata: Metadata = {
  title: "ER Consult MNRH",
  description: "ระบบส่งปรึกษา ER มหาราช",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className="font-sans bg-[#014167] dark:bg-gray-900 min-h-screen transition-colors duration-300" suppressHydrationWarning>
        <SettingsProvider>
          <ToastProvider>
            <Navbar />
            <main className="pb-20 lg:pb-0">
              {children}
            </main>
            <BottomNav />
          </ToastProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}