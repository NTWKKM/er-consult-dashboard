import { describe, it, expect } from "vitest";
import {
  SURGERY_DEPTS,
  ORTHO_DEPTS,
  ALL_DEPARTMENTS,
  ROOMS,
  ACCEPT_STATUS,
  POST_ACCEPT_STATUSES,
  ACTION_STATUSES,
} from "@/lib/constants";

describe("lib/constants", () => {
  describe("ACCEPT_STATUS", () => {
    it('is the Thai string "รับเคส"', () => {
      expect(ACCEPT_STATUS).toBe("รับเคส");
    });
  });

  describe("POST_ACCEPT_STATUSES", () => {
    it("contains exactly Admit, คืน ER, and D/C", () => {
      expect(POST_ACCEPT_STATUSES).toEqual(["Admit", "คืน ER", "D/C"]);
    });

    it("does NOT include ACCEPT_STATUS", () => {
      expect(POST_ACCEPT_STATUSES).not.toContain(ACCEPT_STATUS);
    });

    it("has exactly 3 entries", () => {
      expect(POST_ACCEPT_STATUSES).toHaveLength(3);
    });
  });

  describe("ACTION_STATUSES", () => {
    it("starts with ACCEPT_STATUS", () => {
      expect(ACTION_STATUSES[0]).toBe(ACCEPT_STATUS);
    });

    it("contains all POST_ACCEPT_STATUSES after the first entry", () => {
      const rest = ACTION_STATUSES.slice(1);
      expect(rest).toEqual(POST_ACCEPT_STATUSES);
    });

    it("has exactly 4 entries (1 accept + 3 post-accept)", () => {
      expect(ACTION_STATUSES).toHaveLength(4);
    });

    it("equals [ACCEPT_STATUS, ...POST_ACCEPT_STATUSES]", () => {
      expect(ACTION_STATUSES).toEqual([ACCEPT_STATUS, ...POST_ACCEPT_STATUSES]);
    });

    it("contains Admit, คืน ER, and D/C", () => {
      expect(ACTION_STATUSES).toContain("Admit");
      expect(ACTION_STATUSES).toContain("คืน ER");
      expect(ACTION_STATUSES).toContain("D/C");
    });
  });

  describe("SURGERY_DEPTS", () => {
    it("contains known surgery departments", () => {
      expect(SURGERY_DEPTS).toContain("Gen Sx");
      expect(SURGERY_DEPTS).toContain("Sx Trauma");
      expect(SURGERY_DEPTS).toContain("Neuro Sx");
    });

    it("does not contain Ortho", () => {
      expect(SURGERY_DEPTS).not.toContain("Ortho");
    });
  });

  describe("ORTHO_DEPTS", () => {
    it('contains only "Ortho"', () => {
      expect(ORTHO_DEPTS).toEqual(["Ortho"]);
    });

    it("does not overlap with SURGERY_DEPTS", () => {
      const overlap = ORTHO_DEPTS.filter((d) =>
        (SURGERY_DEPTS as readonly string[]).includes(d)
      );
      expect(overlap).toHaveLength(0);
    });
  });

  describe("ALL_DEPARTMENTS", () => {
    it("includes all SURGERY_DEPTS", () => {
      for (const dept of SURGERY_DEPTS) {
        expect(ALL_DEPARTMENTS).toContain(dept);
      }
    });

    it("includes all ORTHO_DEPTS", () => {
      for (const dept of ORTHO_DEPTS) {
        expect(ALL_DEPARTMENTS).toContain(dept);
      }
    });

    it("has length equal to SURGERY_DEPTS + ORTHO_DEPTS", () => {
      expect(ALL_DEPARTMENTS).toHaveLength(
        SURGERY_DEPTS.length + ORTHO_DEPTS.length
      );
    });

    it("has no duplicate entries", () => {
      const unique = new Set(ALL_DEPARTMENTS);
      expect(unique.size).toBe(ALL_DEPARTMENTS.length);
    });
  });

  describe("ROOMS", () => {
    it("contains Resus rooms", () => {
      expect(ROOMS).toContain("Resus Team 1");
      expect(ROOMS).toContain("Resus Team 2");
    });

    it("has no duplicate entries", () => {
      const unique = new Set(ROOMS);
      expect(unique.size).toBe(ROOMS.length);
    });
  });
});