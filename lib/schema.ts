import { z } from "zod";
import { ROOMS, ACTION_STATUSES } from "./constants";

// Define the schema for a single transfer
export const TransferSchema = z.object({
  to: z.enum(ROOMS),
  at: z.string().datetime().optional(), // ISO string
});

// Define the schema for a department's status
export const DepartmentSchema = z.object({
  status: z.enum(["pending", "completed", "cancelled"]),
  completedAt: z.string().datetime().nullable(),
  acceptedAt: z.string().datetime().nullable().optional(),
  actionStatus: z.enum(ACTION_STATUSES).optional(),
  admittedAt: z.string().datetime().nullable().optional(),
  returnedAt: z.string().datetime().nullable().optional(),
  dischargedAt: z.string().datetime().nullable().optional(),
  transfers: z.array(TransferSchema).optional(),
});

// Define the schema for a single re-consult event
export const ReconsultEntrySchema = z.object({
  at: z.string().datetime(),
  departments: z.array(z.string()).min(1),
  problem: z.string(),
});

// Define the schema for the main Consult document
export const ConsultSchema = z.object({
  id: z.string(),
  hn: z.string().regex(/^\d+$/, "HN must contain only numeric digits"),
  // Fallback to empty strings if missing (backward compatibility with old data)
  firstName: z.string().optional().default(""),
  lastName: z.string().optional().default(""),
  room: z.enum(ROOMS),
  problem: z.string(),
  createdAt: z.string().datetime(),
  reconsultedAt: z.string().datetime().optional(),
  reconsultHistory: z.array(ReconsultEntrySchema).optional(),
  status: z.enum(["pending", "completed", "cancelled"]),
  isUrgent: z.boolean(),
  // Allow dynamic keys but strictly enforce the DepartmentSchema shape
  departments: z.record(z.string(), DepartmentSchema),
});

export type ConsultTransfer = z.infer<typeof TransferSchema>;
export type ConsultDepartment = z.infer<typeof DepartmentSchema>;
export type ConsultReconsultEntry = z.infer<typeof ReconsultEntrySchema>;
export type Consult = z.infer<typeof ConsultSchema>;
