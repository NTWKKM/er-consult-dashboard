import type { Metadata } from "next";
import { Inter } from "next/font/google"; // ใช้ฟอนต์ Inter ดีอยู่แล้วครับ ชัดเจน ทันสมัย
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
      {/* VVVV แก้ไข: เปลี่ยนพื้นหลังเป็น bg-slate-100 (เทาอ่อนสะอาดตา) VVVV */}
      <body className={`${inter.className} bg-slate-100`}>
        
        {/* VVVV แก้ไข: เปลี่ยน Navbar เป็นสีน้ำเงินเข้ม ดูน่าเชื่อถือ VVVV */}
        <nav className="bg-blue-900 text-white shadow-lg"> 
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="text-xl font-bold hover:text-blue-200 transition-colors">
                ER Consult Dashboard
              </Link>
              <Link href="/submit" className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow">
                + ส่งเคสปรึกษา
              </Link>
            </div>
          </div>
        </nav>
        {/* ^^^^ สิ้นสุด Navbar ^^^^ */}

        <main>
          {children}
        </main>
        
      </body>
    </html>
  );
}