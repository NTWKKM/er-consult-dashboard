import type { Consult, ConsultDepartment } from "./db";

/**
 * Neutralize spreadsheet formula triggers (=, +, -, @, tab/CR) so clinical Dx strings
 * like "+ve FAST" or "-ve guarding" export as literal text instead of Excel formulas.
 */
export function sanitizeExcelCell(value: string): string {
  return /^[\t\r\n]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function formatBangkokTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

export interface CompletedExportRow {
  HN: string;
  ชื่อ: string;
  นามสกุล: string;
  ห้อง: string;
  Dx: string;
  แผนก: string;
  วันที่ส่ง: string;
  รับเคส: string;
  Admit: string;
  "คืน ER": string;
  "D/C": string;
  ปิดเคส: string;
  ยกเลิก: string;
}

/**
 * Map completed Consult records into sanitized, Bangkok-formatted Excel export rows.
 */
export function buildCompletedExportRows(consults: Consult[]): CompletedExportRow[] {
  return consults.map((c) => {
    const depts = Object.keys(c.departments).join(", ");

    // Returns times for non-cancelled departments only (for "ปิดเคส")
    const getTimesFor = (key: keyof ConsultDepartment, excludeStatus?: string) => {
      return Object.entries(c.departments)
        .map(([dept, data]) => {
          const time = data[key] as string | undefined;
          if (!time) return null;
          if (excludeStatus && data.status === excludeStatus) return null;
          return `${dept}: ${formatBangkokTimestamp(time)}`;
        })
        .filter(Boolean)
        .join("\n");
    };

    // Returns times for cancelled departments only (for "ยกเลิก" column)
    const getCancelledTimesFor = (key: keyof ConsultDepartment) => {
      return Object.entries(c.departments)
        .map(([dept, data]) => {
          const time = data[key] as string | undefined;
          if (!time || data.status !== "cancelled") return null;
          return `${dept}: ${formatBangkokTimestamp(time)}`;
        })
        .filter(Boolean)
        .join("\n");
    };

    return {
      HN: c.hn || "-",
      ชื่อ: sanitizeExcelCell(c.firstName || "-"),
      นามสกุล: sanitizeExcelCell(c.lastName || "-"),
      ห้อง: c.room || "-",
      Dx: sanitizeExcelCell(c.problem || "-"),
      แผนก: depts,
      วันที่ส่ง: c.createdAt ? formatBangkokTimestamp(c.createdAt) : "-",
      รับเคส: getTimesFor("acceptedAt") || "-",
      Admit: getTimesFor("admittedAt") || "-",
      "คืน ER": getTimesFor("returnedAt") || "-",
      "D/C": getTimesFor("dischargedAt") || "-",
      ปิดเคส: getTimesFor("completedAt", "cancelled") || "-", // excluded cancelled
      ยกเลิก: getCancelledTimesFor("completedAt") || "-", // cancelled only
    };
  });
}
