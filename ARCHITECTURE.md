# ARCHITECTURE.md - ER Consult Dashboard Development Standards

## 1. Project Mission & Context

- **Environment:** High-pressure hospital Emergency Room (ER).
- **Core Value:** Data integrity is paramount. A lost or delayed consult entry can impact patient safety.
- **User Personas:** Medical staff requiring instantaneous updates and zero-fail operations.
- **Source Code (GitHub):** [NTWKKM/er-consult-dashboard](https://github.com/NTWKKM/er-consult-dashboard)
- **Deployment (Vercel):** [er-consult-dashboard](https://vercel.com/ntwkms-projects/er-consult-dashboard)

## 2. Technical Stack Standards

- **Framework:** Next.js (App Router) with TypeScript.
- **Database:** Firebase Firestore (Real-time sync, initialized via `lib/firebase.ts` with secrets from `.env.local` or Vercel Environment Variables).
- **UI:** Tailwind CSS with a focus on high-contrast, accessible components.
- **State Management:** React Hooks + Context API for global settings.

## 3. Optimistic UI Implementation Rules

To ensure the app feels instantaneous under intermittent hospital Wi-Fi, apply these patterns:

- **Local-First Update:** When a user triggers an action, update the local state immediately before the network request completes.
- **Loading Indicators:** Use `SkeletonLoading` for background sync, but do not block the entire UI unless data is strictly required.
- **Rollback Mechanism:** Every optimistic update MUST have an error handler that reverts the local state if the Firestore write fails.
- **Visual Feedback:** Provide immediate success/error feedback via `ToastContext`.

## 4. Data Stability & Integrity Protocols

- **Atomic Operations:** Use Firestore Transactions (`runTransaction`) for operations depending on current state.
- **Schema Validation:** Strictly adhere to interfaces and validate all incoming Firestore data at runtime using `zod` (`lib/schema.ts`).
- **Offline Resilience:** Ensure functionality during momentary signal drops. `persistentLocalCache` must remain enabled.
- **Race Condition Prevention:** Implement UI locks (e.g., disabling buttons) during in-flight mutations. Never allow concurrent identical network requests for the same record.
- **Strict Type Safety:** The use of `any` type is strictly forbidden. All database payloads must explicitly conform to mapped types (e.g., Firestore `UpdateData<T>`) before writing.
- **Database Indexes:** Compound/Composite Indexes must be maintained in `firestore.indexes.json` to ensure complex queries (e.g., sorting by `createdAt` while filtering by `status`) do not fail.
- **Mock Data & Testing:** Any script generating mock data MUST strictly adhere to the `Zod` schemas defined in `lib/schema.ts`. Scripts that generate malformed data are strictly forbidden as they pollute the database and fail client-side parsing.

## 5. UI/UX & Language Standards

- **Professionalism:** All user-facing strings (Labels, Modals, Toasts) MUST use **Professional Medical English** (e.g., "Awaiting Specialty Evaluation").
- **UI Architecture:** The dashboard utilizes a globally visible Whiteboard-style layout (Grid/Table Toggle). For full styling, animation, and glassmorphism standards, refer to `DESIGN.md`. Do not deviate from these rules without explicit prior approval.

## 6. Strict Development Workflow for AI Agent

- **Thorough Context Review:** BEFORE proposing any changes, you must meticulously analyze the original code of the target file AND review the entire repository context to understand dependencies.
- **Preserve Comments & Logic:** You MUST retain ALL existing comments. The core functionality must remain as close to the original as possible.
- **Implementation Plan Required:** For any major refactoring or large tasks, STOP and provide a step-by-step "Implementation Plan" first. Wait for my explicit confirmation before modifying any code.
- **Mandatory Review Targets:** Always check `lib/db.ts` and `app/hooks/useConsultActions.ts` before altering database logic.

## 7. Security & Patient Privacy (PHI)

- **Authentication:** All access requires Firebase Authentication via `AuthContext`.
- **Secrets Management:** Secrets and config parameters are loaded from `.env.local` for local development. This file contains Firebase Web App API keys and credentials, which must NEVER be committed to the public Git repository. In production, these parameters are managed securely via Vercel Environment Variables.
- **Infrastructure as Code:** `firestore.rules` must be strictly maintained in the repository to block unauthenticated access.
- **No Sensitive Logging:** Under absolutely NO circumstances should Patient Identifiable Information (PII/PHI) such as Patient Names, Hospital Numbers (HN), or specific medical diagnoses be logged to `console.log()`, external error trackers, or any unencrypted analytics service.
- **Data Minimization:** Fetch and display only the data strictly necessary for the immediate clinical workflow.

## 8. Database Usage & Quota Management (Firebase Spark Plan)

- **Strict Export Safeguards:** To protect against daily read quota exhaustion (50,000 reads/day) on the Free Tier, a hard 31-day limit is enforced on all data exports (e.g., Excel exports). UI-level validation prevents exceeding this limit.
- **Optimized Data Retrieval:** Historical queries (e.g., in `app/completed/page.tsx`) must utilize Firestore cursors (`cursorMapRef`) to manage paginated reads, rather than fetching bulk documents.
- **Security Restrictions:** `firestore.rules` are hardened. Collection-specific matching (`/consults/{consultId}`) is strictly enforced, and wildcard paths (`/{document=**}`) are prohibited to block unauthorized or malicious mass-read operations.

## 9. Web Routing & Page Functions

The application contains four main views inside the Next.js App Router structure:

- **`/` (Whiteboard Dashboard):** Displays active consults divided cleanly by departments (Surgery vs Ortho). Supports card/table display toggles (using the View Transitions API for animations), filter settings, and sound alerts that trigger a double beep upon new case arrivals.
- **`/submit` (Consult Submission Form):** Contains form validation for registering new patient consults. Supports Fast Track submissions (sets `isUrgent: true`) with key-combination triggers (`Ctrl+Enter` or `Cmd+Enter`).
- **`/completed` (Completed/History Page):** Historical repository of finished or cancelled consults. Employs server-side prefix querying for HN searches, pagination cursors, the Re-consult modal trigger, and the Excel export interface.
- **`/login`:** Secure portal integrating Firebase Authentication to guard operational views.

## 10. Data Submission Payload Structure

When a patient consult is submitted at `/submit`, the client invokes `addConsult` from `lib/db.ts` to write a document to the `consults` collection with the following shape:

- **`id`:** String auto-generated by the Firestore SDK.
- **`hn`:** String representing patient hospital number (strictly validated to be numeric).
- **`firstName`:** String representing the patient's first name.
- **`lastName`:** String representing the patient's last name.
- **`room`:** String enum designating the patient's examination room (e.g., Resus 1, Room 1, etc.).
- **`problem`:** String detailing clinical findings and reasons for consulting (Dx).
- **`createdAt`:** ISO-8601 string timestamp (`new Date().toISOString()`).
- **`status`:** Constant string set to `"pending"`.
- **`isUrgent`:** Boolean flag (`true` if sent as Fast Track, otherwise `false`).
- **`departments`:** Key-value map (`Record<string, DepartmentSchema>`) where keys are selected department names, and values are:

  ```typescript
  {
    status: "pending",
    completedAt: null
  }
  ```

## 11. Data Retrieval & Subscription Models

- **Active Dashboard Subscription:** The whiteboard listens to active cases via `subscribeToConsultsByStatus("pending", ...)`. This sets up a real-time Firestore `onSnapshot` query ordered by `createdAt` in descending order.
- **Completed History Pagination:** The completed page pulls finished cases via `fetchCompletedConsultsPage` in batches of 25. Cursors (`QueryDocumentSnapshot`) are stored in `cursorMapRef` mapped to page numbers to support proper paging controls without loading large document sets.
- **History Server-side Search:** Prefix search on HN and date-range filters are executed directly on the server via `searchCompletedConsults`, ensuring that completed history can be searched instantly without full-client scans.

## 12. Consult Status & Milestone Lifecycle

Consult cards progress through specific lifecycle milestones represented as timestamp fields under the department's entry in `departments.{deptKey}`:

1. **Case Submission:** Created with `status: "pending"` and `completedAt: null`.
2. **Case Acceptance ("รับเคส"):**
   - Doctor accepts the case via the `handleAccept` callback (invoking `transactionalUpdateConsult` with `awaitRemote: false` for instant UI update).
   - This writes `acceptedAt = timestamp` and `actionStatus = "รับเคส"` to Firestore.
   - Surgery departments automatically accept co-consulted Surgery sub-departments (Surgery, Colo, Vascular, Plastic, Neuro, Pediatric, Trauma, Urology, Ortho) to minimize overhead.
   - Executed inside a transaction to prevent race conditions. If accepted by another physician concurrently, transaction aborts and UI rolls back with a Warning Toast.
3. **Status Transitions ("สถานะ"):**
   - Doctors can shift department status through values: `"Admit"`, `"คืน ER"`, or `"D/C"`.
   - Modifies `actionStatus` to selected value and writes the respective timestamp: `admittedAt`, `returnedAt`, or `dischargedAt`.
4. **Room Transfers ("ย้ายห้อง"):**
   - Transferred via `transferConsultRoom`.
   - Modifies `room` globally and appends a transfer milestone `{ to: newRoom, at: timestamp }` to the `transfers` array of all pending departments under the case.
5. **Completion / Cancellation ("ปิดเคส" / "ยกเลิก"):**
   - Complete sets `status: "completed"`, `completedAt: timestamp`.
   - Cancel sets `status: "cancelled"`, `completedAt: timestamp`.
   - If all departments in a case are either completed or cancelled, the root document `status` transitions to `"completed"`, removing it from the active whiteboard dashboard.

## 13. Urgency Toggling (Fast Track)

Medical staff can dynamically toggle the urgency of an active case (Fast Track vs. Normal) directly from the dashboard:

- The client invokes `handleToggleUrgency` (via `useConsultActions`), which calls `updateConsult` with `awaitRemote: false` for an instantaneous Optimistic UI update.
- This immediately updates the `isUrgent` boolean field on the Firestore document.
- The UI applies the View Transitions API (`document.startViewTransition`) to ensure the transition between the Fast Track status and normal status is fluid and avoids jarring layout shifts. **CRITICAL:** Network requests (`await handleToggleUrgency`) must resolve BEFORE calling `startViewTransition`. Placing asynchronous calls inside the transition callback causes DOM freezing.

## 14. Re-consulting Mechanism

When a doctor triggers a Re-consult on a case from `/completed`:

- The client calls `updateConsult` with `awaitRemote: false` to immediately remove the case from the local completed list and return it to the dashboard.
- The updater callback resets the global document `status` to `"pending"`.
- It resets the selected departments back to:

  ```typescript
  {
    status: "pending",
    completedAt: null
  }
  ```

  *(Note: Stale milestone timestamps like acceptedAt/admittedAt/dischargedAt are completely cleared for the re-consulted departments).*
- It updates the patient problem description by appending the new consultation reason:
  `problem: "${current.problem}\n\n[Re-consult]: ${newProblem}"`
- It updates `createdAt = new Date().toISOString()`, sorting it back to the top of the whiteboard.

## 15. Excel Export Pipeline & Safeguards

- **Export Trigger:** Triggered in `/completed` using date ranges `exportStartDate` and `exportEndDate`.
- **Bandwidth Safeguard:** The frontend validates that the date range is at most 31 days. Ranges exceeding 31 days are rejected to protect against daily read quota exhaustions.
- **Data Generation:** Dynamically imports the `xlsx` package. Map milestones for each department (e.g. Admit time, D/C time, Accept time, Cancel time) and formats them in local Thai Time strictly enforced to the server-side timezone (`toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })`) before exporting to prevent device-specific discrepancies.

## Core Components
1. Whiteboard Dashboard (`app/page.tsx`) — Real-time display of active cases — Dependencies: `useConsults`, `useConsultActions`
2. Submission Form (`app/submit/page.tsx`) — Entry point for new clinical cases — Dependencies: `lib/db.ts` (`addConsult`), `lib/schema.ts`
3. Completed History (`app/completed/page.tsx`) — Searchable archive and export — Dependencies: `fetchCompletedConsultsPage`, `searchCompletedConsults`

## Data Flow
1. `app/submit/page.tsx` → `addConsult` (Firestore SDK) → Firestore `consults` collection (async, local-first write)
2. Firestore `consults` collection → `subscribeToConsultsByStatus` listener → `useConsults` React State (async, cached via `persistentLocalCache`)
3. `useConsults` state → `departmentCasesMap` grouping → `ConsultCard` UI rendering (sync)

## Warnings & Gotchas
- Concurrency / race condition: Root `status` transitions (complete/cancel) depend on department state and must use `transactionalUpdateConsult` to prevent stuck cases during concurrent re-consults.
- Offline-sync edge case: Optimistic UI updates with `awaitRemote: false` apply instantly but must handle rollback on failure. The `TRANSACTION_CONDITION_NOT_MET` warning indicates another physician beat the local write.
- Clinical constraint: Re-consults must preserve non-re-consulted department history (timestamps, statuses) to maintain the full audit trail for Excel exports and clinical review. Document deletions are strictly prohibited.