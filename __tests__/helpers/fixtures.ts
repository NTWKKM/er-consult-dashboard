import { ConsultSchema } from "@/lib/schema";
import type { Consult, ConsultDepartment, UpdateResults } from "@/lib/db";

/**
 * Create a schema-valid ConsultDepartment fixture.
 */
export function makeDepartment(overrides: Partial<ConsultDepartment> = {}): ConsultDepartment {
  return {
    status: "pending",
    completedAt: null,
    ...overrides,
  };
}

/**
 * Create a Consult fixture validated at runtime against ConsultSchema
 * so test fixtures never drift from production Firestore schemas.
 */
export function makeConsult(overrides: Partial<Consult> = {}): Consult {
  const raw: Consult = {
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
      "Gen Sx": makeDepartment(),
    },
    ...overrides,
  };
  return ConsultSchema.parse(raw) as Consult;
}

/**
 * Create a standard UpdateResults object for mocking db update functions.
 */
export function makeUpdateResult(overrides: Partial<UpdateResults> = {}): UpdateResults {
  return {
    consult: null,
    isQueued: true,
    backgroundPromise: Promise.resolve(),
    applied: true,
    ...overrides,
  };
}
