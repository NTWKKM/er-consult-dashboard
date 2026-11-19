// Centralized constants — single source of truth for departments, rooms, and statuses

export const SURGERY_DEPTS = [
  "Gen Sx",
  "Sx Trauma",
  "Neuro Sx",
  "Sx Vascular",
  "Sx Plastic",
  "Uro Sx",
  "CVT",
  "PED SX",
] as const;

export const ORTHO_DEPTS = ["Ortho"] as const;

export const ALL_DEPARTMENTS = [...SURGERY_DEPTS, ...ORTHO_DEPTS] as const;

export const ROOMS = [
  "Resus Team 1",
  "Resus Team 2",
  "Resus Team 3",
  "Resus Team 4",
  "Urgent",
  "NT",
  "SSW",
] as const;

export const ACCEPT_STATUS = "รับเคส" as const;
export const POST_ACCEPT_STATUSES = ["Admit", "คืน ER", "D/C"] as const;
export const ACTION_STATUSES = [ACCEPT_STATUS, ...POST_ACCEPT_STATUSES] as const;

export type DepartmentName = (typeof ALL_DEPARTMENTS)[number];
export type RoomName = (typeof ROOMS)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// Field length and collection bounds enforced by firestore.rules
export const MAX_HN_LENGTH = 32;
export const MAX_PATIENT_NAME_LENGTH = 200;
export const MAX_PROBLEM_CREATE_LENGTH = 5000;
export const MAX_PROBLEM_UPDATE_LENGTH = 10000;
export const MAX_RECONSULT_HISTORY = 50;
