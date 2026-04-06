/**
 * Tests for the departmentCasesMap algorithm extracted from app/page.tsx.
 *
 * The changed useMemo logic:
 * 1. Initialises map with empty arrays for every department.
 * 2. Single O(N) pass: room-filter first, then group each case into its
 *    pending departments.
 * 3. Sorts each bucket via sortConsults().
 *
 * Because this logic is embedded in a React component we mirror it here as a
 * pure function, which is exactly the refactoring the PR introduced.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SURGERY_DEPTS, ORTHO_DEPTS } from "@/lib/constants";
import { buildDepartmentCasesMap } from "@/lib/departmentCasesMap";
import type { Consult } from "@/lib/db";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let idCounter = 0;

function makeConsult(overrides: Partial<Consult> = {}): Consult {
  idCounter++;
  return {
    id: `c${idCounter}`,
    hn: `HN${idCounter}`,
    firstName: "First",
    lastName: "Last",
    room: "NT",
    problem: "Problem",
    createdAt: new Date(2024, 0, idCounter).toISOString(),
    status: "pending",
    isUrgent: false,
    departments: {},
    ...overrides,
  };
}

// Reset counter between tests for deterministic ids
beforeEach(() => { idCounter = 0; });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("departmentCasesMap", () => {
  describe("initialisation", () => {
    it("creates a key for every surgery and ortho department even with no cases", () => {
      const map = buildDepartmentCasesMap([], "all");
      for (const dept of [...SURGERY_DEPTS, ...ORTHO_DEPTS]) {
        expect(map).toHaveProperty(dept);
        expect(map[dept]).toEqual([]);
      }
    });

    it("does NOT create keys for unknown departments (not in constants)", () => {
      const map = buildDepartmentCasesMap([], "all");
      expect(map).not.toHaveProperty("Radiology");
    });
  });

  describe("grouping cases into departments", () => {
    it("adds a pending case to the correct department bucket", () => {
      const c = makeConsult({
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      });
      const map = buildDepartmentCasesMap([c], "all");
      expect(map["Gen Sx"]).toHaveLength(1);
      expect(map["Gen Sx"][0].id).toBe(c.id);
    });

    it("adds a case with multiple pending departments to each bucket", () => {
      const c = makeConsult({
        departments: {
          "Gen Sx": { status: "pending", completedAt: null },
          "Ortho": { status: "pending", completedAt: null },
        },
      });
      const map = buildDepartmentCasesMap([c], "all");
      expect(map["Gen Sx"]).toHaveLength(1);
      expect(map["Ortho"]).toHaveLength(1);
    });

    it("does NOT add a completed department to the pending bucket", () => {
      const c = makeConsult({
        departments: {
          "Gen Sx": { status: "completed", completedAt: "2024-01-01T10:00:00.000Z" },
        },
      });
      const map = buildDepartmentCasesMap([c], "all");
      expect(map["Gen Sx"]).toHaveLength(0);
    });

    it("does NOT add a cancelled department to the pending bucket", () => {
      const c = makeConsult({
        departments: {
          "Gen Sx": { status: "cancelled", completedAt: "2024-01-01T10:00:00.000Z" },
        },
      });
      const map = buildDepartmentCasesMap([c], "all");
      expect(map["Gen Sx"]).toHaveLength(0);
    });

    it("ignores departments that are not in ALL_DEPARTMENTS", () => {
      const c = makeConsult({
        departments: {
          "Unknown Dept": { status: "pending", completedAt: null },
        },
      });
      const map = buildDepartmentCasesMap([c], "all");
      expect(map).not.toHaveProperty("Unknown Dept");
    });
  });

  describe("room filtering", () => {
    it("includes all rooms when filter is 'all'", () => {
      const resus = makeConsult({ room: "Resus Team 1", departments: { "Gen Sx": { status: "pending", completedAt: null } } });
      const nonResus = makeConsult({ room: "NT", departments: { "Gen Sx": { status: "pending", completedAt: null } } });

      const map = buildDepartmentCasesMap([resus, nonResus], "all");
      expect(map["Gen Sx"]).toHaveLength(2);
    });

    it("only includes resus cases when filter is 'resus'", () => {
      const resus = makeConsult({ room: "Resus Team 2", departments: { "Ortho": { status: "pending", completedAt: null } } });
      const nonResus = makeConsult({ room: "SSW", departments: { "Ortho": { status: "pending", completedAt: null } } });

      const map = buildDepartmentCasesMap([resus, nonResus], "resus");
      expect(map["Ortho"]).toHaveLength(1);
      expect(map["Ortho"][0].id).toBe(resus.id);
    });

    it("excludes resus cases when filter is 'non-resus'", () => {
      const resus = makeConsult({ room: "Resus Team 1", departments: { "Neuro Sx": { status: "pending", completedAt: null } } });
      const nonResus = makeConsult({ room: "Urgent", departments: { "Neuro Sx": { status: "pending", completedAt: null } } });

      const map = buildDepartmentCasesMap([resus, nonResus], "non-resus");
      expect(map["Neuro Sx"]).toHaveLength(1);
      expect(map["Neuro Sx"][0].id).toBe(nonResus.id);
    });

    it("treats room check as case-insensitive (RESUS in uppercase)", () => {
      const upperResus = makeConsult({ room: "RESUS TEAM 1", departments: { "Gen Sx": { status: "pending", completedAt: null } } });
      const map = buildDepartmentCasesMap([upperResus], "resus");
      expect(map["Gen Sx"]).toHaveLength(1);
    });

    it("treats case with null-ish room as non-resus", () => {
      const noRoom = makeConsult({ room: "", departments: { "Gen Sx": { status: "pending", completedAt: null } } });
      const map = buildDepartmentCasesMap([noRoom], "non-resus");
      expect(map["Gen Sx"]).toHaveLength(1);
    });

    it("regression: correctly distinguishes 'Non-Resus' from 'Resus'", () => {
      const resus = makeConsult({ room: "Resus", departments: { "Gen Sx": { status: "pending", completedAt: null } } });
      const nonResus = makeConsult({ room: "Non-Resus", departments: { "Gen Sx": { status: "pending", completedAt: null } } });
      
      // Test filter='resus'
      const resusMap = buildDepartmentCasesMap([resus, nonResus], "resus");
      expect(resusMap["Gen Sx"]).toHaveLength(1);
      expect(resusMap["Gen Sx"][0].room).toBe("Resus");

      // Test filter='non-resus'
      const nonResusMap = buildDepartmentCasesMap([resus, nonResus], "non-resus");
      expect(nonResusMap["Gen Sx"]).toHaveLength(1);
      expect(nonResusMap["Gen Sx"][0].room).toBe("Non-Resus");
    });
  });

  describe("security: prototype pollution", () => {
    it("is safe from inherited properties", () => {
      // Create a case that might try to target an inherited property name
      const malicious = makeConsult({
        departments: {
          "toString": { status: "pending", completedAt: null }
        } as Record<string, { status: "pending"; completedAt: null }>
      });

      // The map should not have 'toString' as a valid department key even if it's in the input data,
      // because our code filters by SURGERY_DEPTS/ORTHO_DEPTS.
      // But more importantly, the map itself should be a null-prototype object.
      const map = buildDepartmentCasesMap([malicious], "all");
      
      expect(Object.getPrototypeOf(map)).toBe(null);
      expect(map["toString"]).toBeUndefined();
    });
  });

  describe("sorting", () => {
    it("places urgent cases before non-urgent in each department bucket", () => {
      const normal = makeConsult({
        isUrgent: false,
        createdAt: "2024-01-01T10:00:00.000Z",
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      });
      const urgent = makeConsult({
        isUrgent: true,
        createdAt: "2024-01-01T08:00:00.000Z",
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      });

      const map = buildDepartmentCasesMap([normal, urgent], "all");
      expect(map["Gen Sx"][0].isUrgent).toBe(true);
      expect(map["Gen Sx"][1].isUrgent).toBe(false);
    });

    it("sorts by createdAt descending (newest first) among same-urgency cases", () => {
      const older = makeConsult({
        createdAt: "2024-01-01T08:00:00.000Z",
        departments: { "Ortho": { status: "pending", completedAt: null } },
      });
      const newer = makeConsult({
        createdAt: "2024-01-01T12:00:00.000Z",
        departments: { "Ortho": { status: "pending", completedAt: null } },
      });

      const map = buildDepartmentCasesMap([older, newer], "all");
      expect(map["Ortho"][0].id).toBe(newer.id);
      expect(map["Ortho"][1].id).toBe(older.id);
    });
  });

  describe("O(N) single-pass grouping", () => {
    it("correctly groups the same case into multiple buckets simultaneously", () => {
      const c = makeConsult({
        departments: {
          "Gen Sx": { status: "pending", completedAt: null },
          "Sx Trauma": { status: "pending", completedAt: null },
          "Ortho": { status: "pending", completedAt: null },
        },
      });

      const map = buildDepartmentCasesMap([c], "all");
      expect(map["Gen Sx"]).toHaveLength(1);
      expect(map["Sx Trauma"]).toHaveLength(1);
      expect(map["Ortho"]).toHaveLength(1);
      // All references should point to the same case
      expect(map["Gen Sx"][0]).toBe(c);
    });
  });
});