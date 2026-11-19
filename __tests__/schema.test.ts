import { describe, it, expect } from "vitest";
import { ConsultSchema } from "@/lib/schema";
import { makeConsult, makeDepartment } from "./helpers/fixtures";

describe("ConsultSchema", () => {
  it("accepts a valid consult document", () => {
    const raw = {
      id: "case-1",
      hn: "123456",
      firstName: "สมชาย",
      lastName: "ใจดี",
      room: "Resus Team 1",
      problem: "Acute abdomen",
      createdAt: "2026-01-15T08:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: {
        "Gen Sx": {
          status: "pending",
          completedAt: null,
        },
      },
    };
    expect(ConsultSchema.parse(raw)).toEqual(raw);
  });

  it("defaults missing firstName and lastName to empty strings for legacy documents", () => {
    const legacy = {
      id: "legacy-1",
      hn: "999001",
      room: "Urgent",
      problem: "Head injury",
      createdAt: "2026-01-15T08:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: { "Neuro Sx": makeDepartment() },
    };
    const parsed = ConsultSchema.parse(legacy);
    expect(parsed.firstName).toBe("");
    expect(parsed.lastName).toBe("");
  });

  it("rejects non-numeric HN values", () => {
    expect(() =>
      ConsultSchema.parse({ ...makeConsult(), hn: "HN12345" })
    ).toThrow();
    expect(() =>
      ConsultSchema.parse({ ...makeConsult(), hn: "" })
    ).toThrow();
  });

  it("rejects unknown room names and invalid actionStatus values", () => {
    expect(() =>
      ConsultSchema.parse({ ...makeConsult(), room: "ER-999" })
    ).toThrow();
    expect(() =>
      ConsultSchema.parse({
        ...makeConsult(),
        departments: {
          "Gen Sx": { status: "pending", completedAt: null, actionStatus: "Invalid" },
        },
      })
    ).toThrow();
  });

  it("rejects non-ISO createdAt timestamps", () => {
    expect(() =>
      ConsultSchema.parse({ ...makeConsult(), createdAt: "2026-01-15 08:00:00" })
    ).toThrow();
  });
});
