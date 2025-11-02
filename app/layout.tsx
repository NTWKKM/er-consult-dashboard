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
      <body className={`${inter.className} bg-gray-100`}>
        <nav className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="text-xl font-bold hover:opacity-80 transition-opacity">
                ER Consult Dashboard
              </Link>
              <Link href="/submit" className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-md">
                + ส่งเคสปรึกษา
              </Link>
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