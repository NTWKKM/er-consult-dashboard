import { Consult } from "./db";
import { SURGERY_DEPTS, ORTHO_DEPTS } from "./constants";
import { sortConsults } from "./utils";

export type RoomFilter = "all" | "resus" | "non-resus";

/**
 * Groups a list of consults by their pending departments and applies room filtering.
 * Each department bucket is sorted by urgency and creation date.
 */
export function buildDepartmentCasesMap(
  allCases: Consult[],
  roomFilter: RoomFilter
): { [key: string]: Consult[] } {
  const allDepts = [...SURGERY_DEPTS, ...ORTHO_DEPTS];

  const map: { [key: string]: Consult[] } = allDepts.reduce((acc, dept) => {
    acc[dept] = [];
    return acc;
  }, {} as { [key: string]: Consult[] });

  allCases.forEach((caseData) => {
    const isResus = !!caseData.room?.toLowerCase().includes("resus");
    if (roomFilter === "resus" && !isResus) return;
    if (roomFilter === "non-resus" && isResus) return;

    Object.entries(caseData.departments).forEach(([deptName, deptInfo]) => {
      if (map[deptName] && deptInfo.status === "pending") {
        map[deptName].push(caseData);
      }
    });
  });

  Object.keys(map).forEach((dept) => {
    map[dept] = sortConsults(map[dept]);
  });

  return map;
}
