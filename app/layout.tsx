import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link"; // Import Link สำหรับการนำทาง

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
      <body className={`${inter.className} bg-gray-100`}>
        
        {/* VVVV นี่คือแถบ Navbar ที่เราเพิ่มเข้ามา VVVV */}
        <nav className="bg-gray-800 text-white shadow-lg">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="text-xl font-bold hover:text-blue-300">
                ER Consult Dashboard
              </Link>
              <Link href="/submit" className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                + ส่งเคสปรึกษา
              </Link>
            </div>
          </div>
        </nav>
        {/* ^^^^ สิ้นสุด Navbar ^^^^ */}

        {/* {children} คือเนื้อหาของหน้าต่างๆ (Dashboard, Submit) */}
        <main>
          {children}
        </main>
        
      </body>
    </html>
  );
}