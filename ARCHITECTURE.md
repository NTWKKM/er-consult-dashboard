# ARCHITECTURE.md - ER Consult Dashboard Development Standards

## 1. Project Mission & Context
- **Environment:** High-pressure hospital Emergency Room (ER).
- **Core Value:** Data integrity is paramount. A lost or delayed consult entry can impact patient safety.
- **User Personas:** Medical staff requiring instantaneous updates and zero-fail operations.

## 2. Technical Stack Standards
- **Framework:** Next.js (App Router) with TypeScript.
- **Database:** Firebase Firestore (Real-time sync).
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
- **Schema Validation:** Strictly adhere to interfaces defined in `lib/constants.ts`.
- **Offline Resilience:** Ensure functionality during momentary signal drops.
- **Race Condition Prevention:** Implement UI locks (e.g., disabling buttons) during in-flight mutations. Never allow concurrent identical network requests for the same record.
- **Strict Type Safety:** The use of `any` type is strictly forbidden. All database payloads must explicitly conform to mapped types (e.g., Firestore `UpdateData<T>`) before writing.

## 5. UI/UX & Language Standards
- **Professionalism:** All user-facing strings (Labels, Modals, Toasts) MUST use **Professional Medical English** (e.g., "Awaiting Specialty Evaluation").
- **UI Architecture:** The dashboard utilizes a Split-Screen Spatial UI with Container Queries. For full styling, animation, and glassmorphism standards, refer to `DESIGN.md`. Do not deviate from these rules without explicit prior approval.

## 6. Strict Development Workflow for AI Agent
- **Thorough Context Review:** BEFORE proposing any changes, you must meticulously analyze the original code of the target file AND review the entire repository context to understand dependencies.
- **Preserve Comments & Logic:** You MUST retain ALL existing comments. The core functionality must remain as close to the original as possible.
- **Implementation Plan Required:** For any major refactoring or large tasks, STOP and provide a step-by-step "Implementation Plan" first. Wait for my explicit confirmation before modifying any code.
- **Mandatory Review Targets:** Always check `lib/db.ts` and `app/hooks/useConsultActions.ts` before altering database logic.

## 7. Security & Patient Privacy (PHI)
- **No Sensitive Logging:** Under absolutely NO circumstances should Patient Identifiable Information (PII/PHI) such as Patient Names, Hospital Numbers (HN), or specific medical diagnoses be logged to `console.log()`, external error trackers, or any unencrypted analytics service.
- **Data Minimization:** Fetch and display only the data strictly necessary for the immediate clinical workflow.