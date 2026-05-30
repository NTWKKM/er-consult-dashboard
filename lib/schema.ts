import { z } from "zod";
import { ROOMS, ACTION_STATUSES } from "./constants";

// Define the schema for a single transfer
export const TransferSchema = z.object({
  to: z.enum(ROOMS as unknown as [string, ...string[]]),
  at: z.string().datetime().optional(), // ISO string
});

// Define the schema for a department's status
export const DepartmentSchema = z.object({
  status: z.enum(["pending", "completed", "cancelled"]),
  completedAt: z.string().datetime().nullable(),
  acceptedAt: z.string().datetime().nullable().optional(),
  actionStatus: z.enum(ACTION_STATUSES as unknown as [string, ...string[]]).optional(),
  admittedAt: z.string().datetime().nullable().optional(),
  returnedAt: z.string().datetime().nullable().optional(),
  dischargedAt: z.string().datetime().nullable().optional(),
  transfers: z.array(TransferSchema).optional(),
});

// Define the schema for the main Consult document
export const ConsultSchema = z.object({
  id: z.string(),
  hn: z.string().regex(/^\d+$/, "HN must contain only numeric digits"),
  // Fallback to empty strings if missing (backward compatibility with old data)
  firstName: z.string().catch(""),
  lastName: z.string().catch(""),
  room: z.enum(ROOMS as unknown as [string, ...string[]]),
  problem: z.string(),
  createdAt: z.string().datetime(),
  status: z.enum(["pending", "completed"]),
  isUrgent: z.boolean(),
  // Allow dynamic keys but strictly enforce the DepartmentSchema shape
  departments: z.record(z.string(), DepartmentSchema),
});

export type ConsultFromSchema = z.infer<typeof ConsultSchema>;
