import type { Consult } from "./db";
import { SURGERY_DEPTS, ORTHO_DEPTS } from "./constants";
import { sortConsults } from "./utils";

export type RoomFilter = "all" | "resus" | "non-resus";

// เพิ่มฟังก์ชัน Helper นี้
export function matchesRoomFilter(caseData: Consult, roomFilter: RoomFilter): boolean {
  // ใช้ Regex เพื่อจับคำว่า resus ที่ไม่ใช่ non-resus
  const normalizedRoom = caseData.room?.trim().toLowerCase() ?? "";
  const isResus =
    /\bresus\b/.test(normalizedRoom) &&
    !/\bnon[-\s]?resus\b/.test(normalizedRoom);

  if (roomFilter === "resus" && !isResus) return false;
  if (roomFilter === "non-resus" && isResus) return false;
  return true;
}

export function buildDepartmentCasesMap(
  allCases: Consult[],
  roomFilter: RoomFilter
): Record<string, Consult[]> {
  const allDepts = [...SURGERY_DEPTS, ...ORTHO_DEPTS];

  // สร้าง Object เเปล่าที่ไม่มี Prototype ป้องกัน Prototype Pollution
  const map: Record<string, Consult[]> = allDepts.reduce((acc, dept) => {
    acc[dept] = [];
    return acc;
  }, Object.create(null) as Record<string, Consult[]>);

  allCases.forEach((caseData) => {
    // นำ Helper มาใช้งาน
    if (!matchesRoomFilter(caseData, roomFilter)) return;

    Object.entries(caseData.departments).forEach(([deptName, deptInfo]) => {
      // ใช้ hasOwnProperty เพื่อความปลอดภัย
      if (
        Object.prototype.hasOwnProperty.call(map, deptName) &&
        deptInfo.status === "pending"
      ) {
        map[deptName].push(caseData);
      }
    });
  });

  Object.keys(map).forEach((dept) => {
    map[dept] = sortConsults(map[dept]);
  });

  return map;
}

