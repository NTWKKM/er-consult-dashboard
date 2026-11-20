import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-paper flex items-center justify-center p-4 pb-24 lg:pb-8">
      <div className="w-full max-w-md bg-paper-2 border border-rule rounded-[10px] p-6 sm:p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-[8px] bg-bad-soft border border-bad/30 text-bad mb-4 measured font-semibold text-lg">
          404
        </div>
        <h1 className="text-xl font-medium text-ink mb-2">ไม่พบหน้าที่คุณต้องการ</h1>
        <p className="text-sm text-muted mb-6">
          ลิงก์นี้อาจถูกย้ายหรือไม่มีอยู่ในระบบ ER Consult Dashboard
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[6px] bg-accent text-accent-ink font-medium text-sm hover:opacity-90 transition-opacity tap-feedback"
        >
          กลับหน้าหลัก Whiteboard
        </Link>
      </div>
    </main>
  );
}
