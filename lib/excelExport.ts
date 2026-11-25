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
  "Re-consult ล่าสุด": string;
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

    const acceptTimes = getTimesFor("acceptedAt");
    const admitTimes = getTimesFor("admittedAt");
    const returnTimes = getTimesFor("returnedAt");
    const dcTimes = getTimesFor("dischargedAt");
    const completeTimes = getTimesFor("completedAt", "cancelled");
    const cancelTimes = getCancelledTimesFor("completedAt");

    return {
      HN: c.hn || "-",
      ชื่อ: c.firstName ? sanitizeExcelCell(c.firstName) : "-",
      นามสกุล: c.lastName ? sanitizeExcelCell(c.lastName) : "-",
      ห้อง: c.room || "-",
      Dx: c.problem ? sanitizeExcelCell(c.problem) : "-",
      แผนก: depts ? sanitizeExcelCell(depts) : "-",
      วันที่ส่ง: c.createdAt ? formatBangkokTimestamp(c.createdAt) : "-",
      "Re-consult ล่าสุด": c.reconsultedAt ? formatBangkokTimestamp(c.reconsultedAt) : "-",
      รับเคส: acceptTimes ? sanitizeExcelCell(acceptTimes) : "-",
      Admit: admitTimes ? sanitizeExcelCell(admitTimes) : "-",
      "คืน ER": returnTimes ? sanitizeExcelCell(returnTimes) : "-",
      "D/C": dcTimes ? sanitizeExcelCell(dcTimes) : "-",
      ปิดเคส: completeTimes ? sanitizeExcelCell(completeTimes) : "-", // excluded cancelled
      ยกเลิก: cancelTimes ? sanitizeExcelCell(cancelTimes) : "-", // cancelled only
    };
  });
}

export interface ExportExcelOptions {
  signal?: AbortSignal;
  shouldAbort?: () => boolean;
}

/**
 * Generates an .xlsx buffer using ExcelJS and triggers a browser file download.
 */
export async function exportCompletedRowsToExcel(
  rows: CompletedExportRow[],
  filename: string,
  options?: ExportExcelOptions
): Promise<void> {
  const isAborted = () => Boolean(options?.signal?.aborted || options?.shouldAbort?.());
  if (isAborted()) return;

  const ExcelJSModule = await import("exceljs");
  if (isAborted()) return;

  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Completed Cases");

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]) as Array<keyof CompletedExportRow>;
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: header === "Dx" ? 36 : header === "HN" ? 14 : 20,
    }));
    for (const row of rows) {
      worksheet.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  if (isAborted()) return;

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
