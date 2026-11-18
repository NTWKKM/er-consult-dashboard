import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ClientLayoutWrapper from "./components/ClientLayoutWrapper";
import OfflineIndicator from "./components/OfflineIndicator";

const hostGrotesk = localFont({
  src: "./fonts/HostGrotesk-Variable.woff2",
  weight: "300 800",
  style: "normal",
  variable: "--font-host",
  display: "swap",
});

const atkinsonMono = localFont({
  src: "./fonts/AtkinsonHyperlegibleMono-Variable.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-atkinson-mono",
  display: "swap",
  adjustFontFallback: false,
});

const notoSansThai = localFont({
  src: "./fonts/NotoSansThai-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-thai",
  display: "swap",
});

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
    <html
      lang="th"
      suppressHydrationWarning
      className={`${hostGrotesk.variable} ${atkinsonMono.variable} ${notoSansThai.variable} overflow-x-clip`}
    >
      <body suppressHydrationWarning className="bg-paper text-ink min-h-screen transition-colors duration-200 overflow-x-clip">
        <AuthProvider>
          <SettingsProvider>
            <ToastProvider>
              <OfflineIndicator />
              <ProtectedRoute>
                <ClientLayoutWrapper>
                  {children}
                </ClientLayoutWrapper>
              </ProtectedRoute>
            </ToastProvider>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
