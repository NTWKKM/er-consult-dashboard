import { describe, it, expect } from "vitest";
import { sanitizeExcelCell, buildCompletedExportRows } from "@/lib/excelExport";
import { makeConsult, makeDepartment } from "./helpers/fixtures";

describe("excelExport", () => {
  it("neutralizes leading formula triggers (=, +, -, @) while keeping normal text unchanged", () => {
    expect(sanitizeExcelCell("+ve FAST")).toBe("'+ve FAST");
    expect(sanitizeExcelCell("-ve guarding")).toBe("'-ve guarding");
    expect(sanitizeExcelCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeExcelCell("@alert")).toBe("'@alert");
    expect(sanitizeExcelCell("\t=1+1")).toBe("'\t=1+1");
    expect(sanitizeExcelCell("R/O acute appendicitis")).toBe("R/O acute appendicitis");
    expect(sanitizeExcelCell("-")).toBe("'-");
  });

  it("maps completed and cancelled department timestamps into separate columns in Asia/Bangkok", () => {
    const consult = makeConsult({
      hn: "654321",
      firstName: "+Test",
      lastName: "Patient",
      problem: "+ve rebound tenderness",
      status: "completed",
      departments: {
        "Gen Sx": makeDepartment({
          status: "completed",
          acceptedAt: "2026-01-15T01:00:00.000Z",
          admittedAt: "2026-01-15T02:00:00.000Z",
          completedAt: "2026-01-15T03:00:00.000Z",
        }),
        Ortho: makeDepartment({
          status: "cancelled",
          completedAt: "2026-01-15T01:30:00.000Z",
        }),
      },
    });

    const rows = buildCompletedExportRows([consult]);
    expect(rows).toHaveLength(1);
    expect(rows[0].HN).toBe("654321");
    expect(rows[0].ชื่อ).toBe("'+Test");
    expect(rows[0].Dx).toBe("'+ve rebound tenderness");
    expect(rows[0].ปิดเคส).toContain("Gen Sx:");
    expect(rows[0].ปิดเคส).not.toContain("Ortho:");
    expect(rows[0].ยกเลิก).toContain("Ortho:");
    expect(rows[0].ยกเลิก).not.toContain("Gen Sx:");
  });
});
