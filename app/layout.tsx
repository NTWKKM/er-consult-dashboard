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
      <body className={`${inter.className} bg-[#014167] min-h-screen`}>
        <nav className="bg-[#014167] shadow-lg border-b border-[#E55143]/30 sticky top-0 z-50 backdrop-blur-sm">
          <div className="container mx-auto px-3">
            <div className="flex justify-between items-center h-14">
              <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity group">
                <div className="w-10 h-10 bg-[#E55143] backdrop-blur-sm rounded-lg flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform glow-hover">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-[#FDFCDF] drop-shadow-sm">ER Consult</div>
                  <div className="text-xs text-[#C7CFDA] font-medium">MNRH</div>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Link href="/completed" className="bg-[#C7CFDA] hover:bg-[#C7CFDA]/80 text-[#014167] font-semibold py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2 text-sm border border-[#014167]/30 glow-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <span className="hidden sm:inline">จัดการเคส</span>
                </Link>
                <Link href="/submit" className="bg-[#699D5D] hover:shadow-lg text-[#FDFCDF] font-bold py-2 px-4 rounded-lg shadow-md transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 text-sm glow-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">ส่งเคสปรึกษา</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="pb-20 lg:pb-0">
          {children}
        </main>
        
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#014167] border-t border-[#E55143]/30 shadow-2xl z-50 backdrop-blur-sm">
          <div className="flex justify-around items-center h-16 px-2">
            <Link href="/" className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg hover:bg-[#E55143]/20 transition-all group">
              <svg className="w-6 h-6 text-[#FDFCDF] group-hover:text-[#E55143] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-xs text-[#FDFCDF] font-medium group-hover:text-[#E55143] transition-colors">หน้าแรก</span>
            </Link>
            <Link href="/submit" className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg hover:bg-[#699D5D]/20 transition-all group">
              <div className="relative">
                <svg className="w-6 h-6 text-[#699D5D] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#E55143] rounded-full animate-pulse"></div>
              </div>
              <span className="text-xs text-[#699D5D] font-bold group-hover:scale-105 transition-transform">ส่งเคส</span>
            </Link>
            <Link href="/completed" className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg hover:bg-[#C7CFDA]/20 transition-all group">
              <svg className="w-6 h-6 text-[#FDFCDF] group-hover:text-[#C7CFDA] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span className="text-xs text-[#FDFCDF] font-medium group-hover:text-[#C7CFDA] transition-colors">จัดการ</span>
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
