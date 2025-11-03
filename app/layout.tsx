import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="th">
      <body className={`${inter.className}`} style={{background: 'linear-gradient(135deg, #181818 0%, #072A40 100%)', minHeight: '100vh'}}>
        <nav className="vibrant-gradient shadow-lg border-b border-[#FF4500]/30 sticky top-0 z-50 backdrop-blur-sm">
          <div className="container mx-auto px-3">
            <div className="flex justify-between items-center h-14">
              <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity group">
                <div className="w-10 h-10 accent-gradient-orange backdrop-blur-sm rounded-lg flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform glow-hover">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-[#F5E8D8] drop-shadow-sm">ER Consult</div>
                  <div className="text-xs text-[#DAA520] font-medium">MNRH</div>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Link href="/completed" className="bg-[#072A40]/80 hover:bg-[#072A40] text-[#F5E8D8] font-semibold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2 text-sm border border-[#DAA520]/30 glow-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <span className="hidden sm:inline">จัดการเคส</span>
                </Link>
                <Link href="/submit" className="accent-gradient-gold hover:shadow-lg text-[#181818] font-bold py-2 px-4 rounded-lg shadow-md transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 text-sm glow-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">ส่งเคสปรึกษา</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
