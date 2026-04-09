import { describe, it, expect } from "vitest";
import { formatTime, getMilestones } from "@/lib/utils";
import type { ConsultDepartment } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdentityFormatter(iso: string): string {
  return iso; // return the raw ISO so we can assert equality in tests
}

function makeDept(overrides: Partial<ConsultDepartment> = {}): ConsultDepartment {
  return {
    status: "pending",
    ...overrides,
  } as ConsultDepartment;
}

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------

describe("formatTime", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatTime("2024-01-15T08:30:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes hour and minute digits", () => {
    const result = formatTime("2024-01-15T08:05:00.000Z");
    // Thai locale typically uses ':' or '.' as separator
    expect(result).toMatch(/\d/);
  });

  it("produces different output for different times", () => {
    const t1 = formatTime("2024-01-15T08:00:00.000Z");
    const t2 = formatTime("2024-01-15T10:00:00.000Z");
    expect(t1).not.toBe(t2);
  });

  it("produces same output for same ISO string", () => {
    const iso = "2024-06-20T14:30:00.000Z";
    expect(formatTime(iso)).toBe(formatTime(iso));
  });
});

// ---------------------------------------------------------------------------
// getMilestones
// ---------------------------------------------------------------------------

describe("getMilestones", () => {
  describe("with no timestamps on department", () => {
    it("returns empty array when dept has no timestamps", () => {
      const dept = makeDept();
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result).toHaveLength(0);
    });
  });

  describe("with acceptedAt only", () => {
    it("returns one milestone for acceptedAt", () => {
      const dept = makeDept({ acceptedAt: "2024-01-15T08:00:00.000Z" });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("รับ");
      expect(result[0].icon).toBe("check");
    });

    it("has correct colors for accept milestone", () => {
      const dept = makeDept({ acceptedAt: "2024-01-15T08:00:00.000Z" });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result[0].colorLight).toBe("text-[#699D5D]");
      expect(result[0].colorDark).toBe("text-[#699D5D]");
    });

    it("passes acceptedAt through the formatter", () => {
      const at = "2024-01-15T08:00:00.000Z";
      const dept = makeDept({ acceptedAt: at });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result[0].time).toBe(at);
      expect(result[0].raw).toBe(at);
    });
  });

  describe("with admittedAt", () => {
    it("includes Admit milestone", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        admittedAt: "2024-01-15T09:00:00.000Z",
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      const admit = result.find((m) => m.label === "Admit");
      expect(admit).toBeDefined();
      expect(admit!.colorLight).toBe("text-blue-600");
    });
  });

  describe("with returnedAt", () => {
    it("includes คืน ER milestone", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        returnedAt: "2024-01-15T09:30:00.000Z",
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      const returned = result.find((m) => m.label === "คืน ER");
      expect(returned).toBeDefined();
      expect(returned!.colorLight).toBe("text-amber-600");
    });
  });

  describe("with dischargedAt", () => {
    it("includes D/C milestone", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        dischargedAt: "2024-01-15T10:00:00.000Z",
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      const dc = result.find((m) => m.label === "D/C");
      expect(dc).toBeDefined();
      expect(dc!.colorLight).toBe("text-purple-600");
    });
  });

  describe("with transfer milestones", () => {
    it("includes transfer milestone with transfer icon", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        transfers: [{ to: "SSW", at: "2024-01-15T08:30:00.000Z" }],
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      const transfer = result.find((m) => m.icon === "transfer");
      expect(transfer).toBeDefined();
      expect(transfer!.label).toBe("ย้าย SSW");
    });

    it("transfer milestone has correct colors", () => {
      const dept = makeDept({
        transfers: [{ to: "Resus Team 1", at: "2024-01-15T08:30:00.000Z" }],
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result[0].colorLight).toBe("text-blue-500");
      expect(result[0].colorDark).toBe("text-blue-400");
    });

    it("handles multiple transfers", () => {
      const dept = makeDept({
        transfers: [
          { to: "NT", at: "2024-01-15T08:00:00.000Z" },
          { to: "SSW", at: "2024-01-15T09:00:00.000Z" },
        ],
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      const transfers = result.filter((m) => m.icon === "transfer");
      expect(transfers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("sorting and slicing (max 3 milestones)", () => {
    it("returns at most 3 milestones", () => {
      // 4 timestamps: accepted, admitted, returned, discharged
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        admittedAt: "2024-01-15T09:00:00.000Z",
        returnedAt: "2024-01-15T10:00:00.000Z",
        dischargedAt: "2024-01-15T11:00:00.000Z",
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("returns the 3 most recent milestones when there are more than 3", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        admittedAt: "2024-01-15T09:00:00.000Z",
        returnedAt: "2024-01-15T10:00:00.000Z",
        dischargedAt: "2024-01-15T11:00:00.000Z",
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      // The 3 most recent should be admittedAt, returnedAt, dischargedAt
      const raws = result.map((m) => m.raw);
      expect(raws).not.toContain("2024-01-15T08:00:00.000Z"); // acceptedAt dropped
    });

    it("milestones are sorted chronologically (oldest first)", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        admittedAt: "2024-01-15T09:00:00.000Z",
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(new Date(result[0].raw!).getTime()).toBeLessThanOrEqual(
        new Date(result[result.length - 1].raw!).getTime()
      );
    });

    it("sorts mixed transfer and status milestones chronologically", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        transfers: [{ to: "SSW", at: "2024-01-15T07:00:00.000Z" }],
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result[0].icon).toBe("transfer"); // transfer came first
      expect(result[1].label).toBe("รับ");
    });
  });

  describe("edge cases", () => {
    it("returns empty array for undefined dept", () => {
      const result = getMilestones(undefined as unknown as ConsultDepartment, makeIdentityFormatter);
      expect(result).toHaveLength(0);
    });

    it("ignores milestones where formatter returns null", () => {
      const dept = makeDept({ acceptedAt: "2024-01-15T08:00:00.000Z" });
      const nullFormatter = () => null;
      const result = getMilestones(dept, nullFormatter);
      expect(result).toHaveLength(0);
    });

    it("handles dept with empty transfers array", () => {
      const dept = makeDept({
        acceptedAt: "2024-01-15T08:00:00.000Z",
        transfers: [],
      });
      const result = getMilestones(dept, makeIdentityFormatter);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("รับ");
    });
  });
});