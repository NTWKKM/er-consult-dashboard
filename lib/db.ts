import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, updateDoc, runTransaction, query, where, orderBy, onSnapshot, limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData, arrayUnion, type Firestore, type QueryConstraint, type UpdateData } from "firebase/firestore";
import { sortConsults } from "./utils";
import { getUtcRangeForLocalDate } from "./dateUtils";
import { RoomName } from "./constants";
import { ConsultSchema, type Consult, type ConsultDepartment, type ConsultTransfer } from "./schema";
import { z, ZodError } from "zod";

export type { Consult, ConsultDepartment, ConsultTransfer };

const COLLECTION_NAME = "consults";

function requireDb(): Firestore {
    if (!db) {
        throw new Error(
            "Firestore is not configured: missing NEXT_PUBLIC_FIREBASE_API_KEY or NEXT_PUBLIC_FIREBASE_PROJECT_ID."
        );
    }
    return db;
}

/**
 * Sanitizes and validates raw Firestore data into a Consult object using Zod.
 */
function mapRawToConsult(id: string, data: DocumentData): Consult | null {
    if (!data) return null;
    
    try {
        const parsed = ConsultSchema.parse({ ...data, id });
        return parsed as Consult;
    } catch (e: unknown) {
        if (e instanceof ZodError) {
            const safeIssues = e.issues.map((i) => ({ path: i.path, message: i.message }));
            console.error(`[mapRawToConsult] Validation failed for consult ${id}:`, safeIssues);
        } else {
            const message = e instanceof Error ? e.message : "Unknown error";
            console.error(`[mapRawToConsult] Validation failed for consult ${id}:`, message);
        }
        return null; // Ignore malformed documents to prevent app crashes
    }
}

/**
 * Helper to map a Firestore document snapshot to a Consult object.
 */
function mapDocToConsult(document: QueryDocumentSnapshot<DocumentData>): Consult | null {
    return mapRawToConsult(document.id, document.data());
}



// Real-time subscription instead of single fetch
export function subscribeToConsultsByStatus(
    status: "pending" | "completed",
    onData: (consults: Consult[]) => void,
    onError?: (error: Error) => void,
    maxResults?: number
): () => void {
    if (!db) {
        const configError = new Error(
            "Firestore is not configured: missing NEXT_PUBLIC_FIREBASE_API_KEY or NEXT_PUBLIC_FIREBASE_PROJECT_ID."
        );
        if (onError) onError(configError);
        else console.error(configError.message);
        return () => {};
    }

    let q = query(
        collection(db, COLLECTION_NAME),
        where("status", "==", status),
        orderBy("createdAt", "desc")
    );
    
    if (maxResults) {
        q = query(q, limit(maxResults));
    }

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const consults: Consult[] = [];
        querySnapshot.forEach((document) => {
            const consult = mapDocToConsult(document);
            if (consult && Boolean(consult.hn)) consults.push(consult);
        });

        
        onData(sortConsults(consults));
    }, (error) => {
        if (onError) onError(error);
        else console.error("Firestore subscription error:", error);
    });

    return unsubscribe;
}

/**
 * Firestore cursor-based pagination for completed cases.
 * Fetches `pageSize` documents at a time using startAfter cursor.
 * Returns the fetched consults and the last document snapshot for the next page.
 */
export async function fetchCompletedConsultsPage(
    pageSize: number,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ consults: Consult[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    if (pageSize <= 0) {
        return { consults: [], lastDoc: null, hasMore: false };
    }

    const database = requireDb();
    // Track both valid consults and their corresponding Firestore docs.
    // validDocs[i] is the snapshot for validConsults[i], enabling correct cursor tracking.
    const validConsults: Consult[] = [];
    const validDocs: QueryDocumentSnapshot<DocumentData>[] = [];
    let currentCursor = lastDoc;

    const MAX_SCAN_DOCS = Math.max(250, pageSize * 10);
    const MAX_REFILL_BATCH = Math.max(50, pageSize + 1);
    let totalScanned = 0;
    let isFirstBatch = true;
    let refillBatchFloor = 10;
    let lastScannedDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let overflowContinuationDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let reachedEndOfData = false;

    // ดึงข้อมูลไปเรื่อยๆ จนกว่าจะได้เอกสารที่ถูกต้องครบ pageSize + 1 (เพื่อเช็ค hasMore)
    while (validConsults.length <= pageSize && totalScanned < MAX_SCAN_DOCS) {
        const needed = pageSize + 1 - validConsults.length;
        const remainingScan = MAX_SCAN_DOCS - totalScanned;
        const requestedBatch = isFirstBatch ? needed : Math.max(needed, refillBatchFloor);
        const batchSize = Math.min(remainingScan, requestedBatch);
        let q = query(
            collection(database, COLLECTION_NAME),
            where("status", "==", "completed"),
            orderBy("createdAt", "desc"),
            limit(batchSize)
        );

        if (currentCursor) {
            q = query(q, startAfter(currentCursor));
        }

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            reachedEndOfData = true;
            break;
        }

        totalScanned += snapshot.docs.length;

        for (const docSnap of snapshot.docs) {
            const c = mapDocToConsult(docSnap);
            if (c !== null && Boolean(c.hn)) {
                if (validConsults.length === pageSize) {
                    overflowContinuationDoc = lastScannedDoc ?? validDocs[pageSize - 1];
                    validConsults.push(c);
                    validDocs.push(docSnap);
                    break;
                }
                validConsults.push(c);
                validDocs.push(docSnap);
            }
            lastScannedDoc = docSnap;
        }

        currentCursor = snapshot.docs[snapshot.docs.length - 1];
        if (validConsults.length > pageSize) break;
        // No more documents in Firestore — avoid a wasted extra read
        if (snapshot.docs.length < batchSize) {
            reachedEndOfData = true;
            break;
        }

        if (!isFirstBatch) {
            refillBatchFloor = Math.min(MAX_REFILL_BATCH, refillBatchFloor * 2);
        }
        isFirstBatch = false;
    }

    const hasOverflow = validConsults.length > pageSize;
    const reachedScanLimit =
        !hasOverflow && !reachedEndOfData && totalScanned >= MAX_SCAN_DOCS && lastScannedDoc !== null;
    const hasMore = hasOverflow || reachedScanLimit;
    const pageConsults = hasOverflow ? validConsults.slice(0, pageSize) : validConsults;
    const pageLastDoc = hasOverflow
        ? overflowContinuationDoc
        : reachedScanLimit
          ? lastScannedDoc
          : pageConsults.length > 0
            ? validDocs[pageConsults.length - 1]
            : null;

    return {
        consults: pageConsults,
        lastDoc: pageLastDoc,
        hasMore,
    };
}

/**
 * Search completed consults by exact HN or date range.
 * This provides server-side filtering to bypass pagination limitations.
 */
export const MAX_HN_SEARCH_RESULTS = 100;

export interface SearchCompletedConsultsResult {
    consults: Consult[];
    truncated: boolean;
    hasMore: boolean;
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}

export async function searchCompletedConsults(
    searchHN?: string,
    filterDate?: string,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<SearchCompletedConsultsResult> {
    const database = requireDb();
    const trimmedHN = searchHN?.trim() ?? "";

    // If searching by HN, query by prefix with server-side status (and optional date bounds)
    // before applying a bounded limit to protect Firebase Spark Plan daily read quotas (50k reads/day).
    if (trimmedHN) {
        const constraints: QueryConstraint[] = [
            where("status", "==", "completed"),
            where("hn", ">=", trimmedHN),
            where("hn", "<", trimmedHN + "\uf8ff"),
        ];

        if (filterDate) {
            const { start, endExclusive } = getUtcRangeForLocalDate(filterDate);
            constraints.push(
                where("createdAt", ">=", start),
                where("createdAt", "<", endExclusive)
            );
        }

        // Preserve Firestore inequality ordering: HN range first, then createdAt when date-bounded
        constraints.push(orderBy("hn", "asc"));
        if (filterDate) {
            constraints.push(orderBy("createdAt", "desc"));
        }
        if (lastDoc) {
            constraints.push(startAfter(lastDoc));
        }
        constraints.push(limit(MAX_HN_SEARCH_RESULTS + 1));

        const q = query(collection(database, COLLECTION_NAME), ...constraints);
        const snapshot = await getDocs(q);
        const hasMore = snapshot.docs.length > MAX_HN_SEARCH_RESULTS;
        const pageDocs = hasMore ? snapshot.docs.slice(0, MAX_HN_SEARCH_RESULTS) : snapshot.docs;
        const nextCursor = hasMore ? (pageDocs[pageDocs.length - 1] ?? null) : null;

        let consults = pageDocs
            .map(mapDocToConsult)
            .filter((c): c is Consult => c !== null && Boolean(c.hn));

        if (filterDate) {
            const { start, endExclusive } = getUtcRangeForLocalDate(filterDate);
            consults = consults.filter(c => c.createdAt && c.createdAt >= start && c.createdAt < endExclusive);
        }

        return {
            consults: consults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
            truncated: hasMore,
            hasMore,
            lastDoc: nextCursor,
        };
    }

    // If only filtering by date, use the existing status + createdAt index
    if (filterDate) {
        const { start, endExclusive } = getUtcRangeForLocalDate(filterDate);
        
        const q = query(
            collection(database, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", start),
            where("createdAt", "<", endExclusive),
            orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(q);
        return {
            consults: snapshot.docs
                .map(mapDocToConsult)
                .filter((c): c is Consult => c !== null && Boolean(c.hn)),
            truncated: false,
            hasMore: false,
            lastDoc: null,
        };
    }

    return {
        consults: [],
        truncated: false,
        hasMore: false,
        lastDoc: null,
    };
}

export type ExportTruncationReason = "limit_exceeded" | "unconfirmed_completeness";

export interface ExportConsultsOptions {
    signal?: AbortSignal;
}

export function isPermissionDeniedError(err: unknown): boolean {
    if (typeof err !== "object" || err === null) return false;
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" && code.includes("permission-denied");
}

const pendingOptimisticWrites = new Set<Promise<unknown>>();
let optimisticWriteSeq = 0;

export function hasPendingOptimisticWrites(): boolean {
    return pendingOptimisticWrites.size > 0;
}

export interface RetainedSubmitDraft {
    consult: Consult;
    status: "pending" | "failed";
    error?: unknown;
}

const SUBMIT_DRAFTS_STORAGE_KEY = "er_consult_submit_drafts_v1";
const PersistedSubmitDraftSchema = z.object({
    consult: ConsultSchema,
    status: z.enum(["pending", "failed"]),
});

const retainedSubmitDrafts = new Map<string, RetainedSubmitDraft>();
const activeSubmitWriteIds = new Set<string>();
const failedDraftListeners = new Set<(draft: Consult, error?: unknown) => void>();
let draftsHydrated = false;

export function subscribeToFailedSubmitDrafts(
    listener: (draft: Consult, error?: unknown) => void
): () => void {
    failedDraftListeners.add(listener);
    return () => {
        failedDraftListeners.delete(listener);
    };
}

function notifyFailedDraftListeners(draft: Consult, error?: unknown): void {
    for (const listener of failedDraftListeners) {
        try {
            listener(draft, error);
        } catch {
            // Isolate listener errors
        }
    }
}

function persistSubmitDrafts(): void {
    if (typeof window === "undefined") return;
    try {
        if (!window.sessionStorage) return;
        if (retainedSubmitDrafts.size === 0) {
            window.sessionStorage.removeItem(SUBMIT_DRAFTS_STORAGE_KEY);
            return;
        }
        const serialized = Array.from(retainedSubmitDrafts.values()).map(({ consult, status }) => ({
            consult,
            status,
        }));
        window.sessionStorage.setItem(SUBMIT_DRAFTS_STORAGE_KEY, JSON.stringify(serialized));
    } catch {
        // Ignore storage quota or private-browsing errors
    }
}

function ensureDraftsHydrated(): void {
    if (draftsHydrated) return;
    draftsHydrated = true;
    if (typeof window === "undefined") return;
    try {
        const raw = window.sessionStorage?.getItem(SUBMIT_DRAFTS_STORAGE_KEY);
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        for (const item of parsed) {
            const validated = PersistedSubmitDraftSchema.safeParse(item);
            if (validated.success && !retainedSubmitDrafts.has(validated.data.consult.id)) {
                retainedSubmitDrafts.set(validated.data.consult.id, {
                    consult: validated.data.consult,
                    status: validated.data.status,
                });
            }
        }
    } catch {
        // Ignore malformed storage entries
    }
}

export function getLatestFailedSubmitDraft(): Consult | null {
    ensureDraftsHydrated();
    let latest: Consult | null = null;
    for (const entry of retainedSubmitDrafts.values()) {
        if (entry.status === "failed") {
            latest = entry.consult;
        }
    }
    return latest;
}

export function getRetainedSubmitDraft(id: string): RetainedSubmitDraft | undefined {
    ensureDraftsHydrated();
    return retainedSubmitDrafts.get(id);
}

export function clearRetainedSubmitDraft(id?: string): void {
    ensureDraftsHydrated();
    if (id === undefined) {
        retainedSubmitDrafts.clear();
        activeSubmitWriteIds.clear();
        persistSubmitDrafts();
        return;
    }
    retainedSubmitDrafts.delete(id);
    activeSubmitWriteIds.delete(id);
    persistSubmitDrafts();
}

/**
 * Reconciles submit drafts loaded from sessionStorage after a page reload before an
 * optimistic write settled. Clears drafts already committed to Firestore and promotes
 * unpersisted/errored drafts to "failed" so the user can retry them.
 */
export async function reconcileReloadedSubmitDrafts(): Promise<Consult | null> {
    ensureDraftsHydrated();
    if (!db) return getLatestFailedSubmitDraft();

    const orphanedPending = Array.from(retainedSubmitDrafts.entries()).filter(
        ([id, entry]) => entry.status === "pending" && !activeSubmitWriteIds.has(id)
    );

    for (const [id, entry] of orphanedPending) {
        try {
            const docSnap = await getDoc(doc(db, COLLECTION_NAME, id));
            if (docSnap.exists() && !docSnap.metadata?.hasPendingWrites) {
                retainedSubmitDrafts.delete(id);
            } else if (!docSnap.exists()) {
                retainedSubmitDrafts.set(id, { ...entry, status: "failed" });
            }
        } catch (err) {
            retainedSubmitDrafts.set(id, { ...entry, status: "failed", error: err });
        }
    }

    if (orphanedPending.length > 0) {
        persistSubmitDrafts();
    }
    return getLatestFailedSubmitDraft();
}

/**
 * Monitors reloaded "pending" submit drafts across all routes via Firestore metadata-aware
 * snapshot listeners until each draft either commits remotely or fails/rolls back.
 * Invokes `onFailed` once per draft that fails after reload and keeps it retryable in sessionStorage.
 */
export function monitorReloadedPendingSubmitDrafts(
    onFailed?: (draft: Consult, error?: unknown) => void
): () => void {
    ensureDraftsHydrated();
    if (!db) return () => {};

    const database = db;
    const unsubscribers: Array<() => void> = [];

    for (const [id, entry] of retainedSubmitDrafts.entries()) {
        if (entry.status !== "pending" || activeSubmitWriteIds.has(id)) {
            continue;
        }

        let settled = false;
        let unsubscribe: (() => void) | null = null;
        const finish = () => {
            settled = true;
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
        };
        const markFailed = (err?: unknown) => {
            if (settled) return;
            finish();
            retainedSubmitDrafts.set(id, { ...entry, status: "failed", error: err });
            persistSubmitDrafts();
            onFailed?.(entry.consult, err);
            notifyFailedDraftListeners(entry.consult, err);
        };

        unsubscribe = onSnapshot(
            doc(database, COLLECTION_NAME, id),
            { includeMetadataChanges: true },
            (docSnap) => {
                if (settled) return;
                const hasPendingWrites = Boolean(docSnap.metadata?.hasPendingWrites);
                if (docSnap.exists() && !hasPendingWrites) {
                    // Server commit confirmed — remove retained draft
                    finish();
                    retainedSubmitDrafts.delete(id);
                    persistSubmitDrafts();
                    return;
                }
                if (!docSnap.exists() && !hasPendingWrites) {
                    // Queued write was rejected/dropped or never reached local cache before reload
                    markFailed();
                }
            },
            (err) => {
                markFailed(err);
            }
        );

        unsubscribers.push(() => {
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
        });
    }

    return () => {
        for (const unsub of unsubscribers) {
            unsub();
        }
    };
}

function trackOptimisticWrite<T>(promise: Promise<T>): Promise<T> {
    optimisticWriteSeq += 1;
    pendingOptimisticWrites.add(promise);
    const cleanup = () => {
        pendingOptimisticWrites.delete(promise);
    };
    promise.then(cleanup, cleanup);
    return promise;
}

/**
 * Fetch all completed cases within a date range (for exporting).
 * Uses cursor-based pagination internally to fetch the entire result set.
 */
export async function fetchAllCompletedConsultsForExport(
    startDate: string,
    endDate: string,
    options?: AbortSignal | ExportConsultsOptions
): Promise<{ consults: Consult[]; truncated: boolean; truncationReason?: ExportTruncationReason; permissionDenied?: boolean }> {
    const database = requireDb();
    const { start } = getUtcRangeForLocalDate(startDate);
    const { endExclusive } = getUtcRangeForLocalDate(endDate);
    const signal = options instanceof AbortSignal ? options : options?.signal;
    const isCancelled = () => Boolean(signal?.aborted);
    const startWriteSeq = optimisticWriteSeq;
    let hasPendingWriteOverlap = pendingOptimisticWrites.size > 0;

    let allConsults: Consult[] = [];
    const consultIndexById = new Map<string, number>();
    let lastDoc: QueryDocumentSnapshot < DocumentData > | null = null;
    let truncated = false;
    let truncationReason: ExportTruncationReason | undefined;
    let permissionDenied = false;
    let totalScanned = 0;
    let batchCount = 0;
    const BATCH_SIZE = 1000;
    const MAX_RESULTS = 50000;

    while (true) {
        if (isCancelled()) {
            truncated = true;
            truncationReason = "unconfirmed_completeness";
            break;
        }

        if (pendingOptimisticWrites.size > 0 || optimisticWriteSeq !== startWriteSeq) {
            hasPendingWriteOverlap = true;
        }

        let q = query(
            collection(database, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", start),
            where("createdAt", "<", endExclusive),
            orderBy("createdAt", "asc"),
            limit(BATCH_SIZE)
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        batchCount += 1;
        let snapshot;
        try {
            snapshot = await getDocs(q);
        } catch (err) {
            if (lastDoc !== null) {
                permissionDenied = isPermissionDeniedError(err);
                console.warn(
                    permissionDenied
                        ? "Export batch fetch denied; retaining server-confirmed rows:"
                        : "Export batch fetch failed; retaining server-confirmed rows:",
                    err
                );
                truncated = true;
                truncationReason = "unconfirmed_completeness";
                break;
            }
            throw err;
        }

        if (isCancelled()) {
            truncated = true;
            truncationReason = "unconfirmed_completeness";
            break;
        }

        if (
            snapshot.metadata?.hasPendingWrites === true ||
            pendingOptimisticWrites.size > 0 ||
            optimisticWriteSeq !== startWriteSeq
        ) {
            hasPendingWriteOverlap = true;
        }

        if (snapshot.metadata?.fromCache !== false) {
            console.warn("Export completeness could not be confirmed from cached batch snapshot");
            truncated = true;
            truncationReason = "unconfirmed_completeness";
            break;
        }

        if (snapshot.empty) break;

        totalScanned += snapshot.docs.length;

        const batch = snapshot.docs
            .map(mapDocToConsult)
            .filter((c): c is Consult => c !== null && Boolean(c.hn));

        for (const consult of batch) {
            const existingIndex = consultIndexById.get(consult.id);
            if (existingIndex !== undefined) {
                if (allConsults[existingIndex].createdAt !== consult.createdAt) {
                    allConsults[existingIndex] = consult;
                }
            } else {
                consultIndexById.set(consult.id, allConsults.length);
                allConsults.push(consult);
            }
        }

        // Safety limit to prevent unbounded memory growth or infinite scans over invalid docs
        if (allConsults.length > MAX_RESULTS) {
            allConsults = allConsults.slice(0, MAX_RESULTS);
            console.warn(`Export truncated at ${MAX_RESULTS} results`);
            truncated = true;
            truncationReason = "limit_exceeded";
            break;
        }

        // If we fetched fewer than batch size, we've reached the end
        if (snapshot.docs.length < BATCH_SIZE) break;

        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        if (totalScanned >= MAX_RESULTS + BATCH_SIZE) {
            if (isCancelled()) {
                truncated = true;
                truncationReason = "unconfirmed_completeness";
                break;
            }

            const lookaheadQuery = query(
                collection(database, COLLECTION_NAME),
                where("status", "==", "completed"),
                where("createdAt", ">=", start),
                where("createdAt", "<", endExclusive),
                orderBy("createdAt", "asc"),
                startAfter(lastDoc),
                limit(1)
            );
            try {
                const lookaheadSnapshot = await getDocs(lookaheadQuery);
                if (
                    lookaheadSnapshot.metadata?.hasPendingWrites === true ||
                    pendingOptimisticWrites.size > 0 ||
                    optimisticWriteSeq !== startWriteSeq
                ) {
                    hasPendingWriteOverlap = true;
                }
                if (isCancelled()) {
                    truncated = true;
                    truncationReason = "unconfirmed_completeness";
                } else if (lookaheadSnapshot.metadata?.fromCache !== false) {
                    console.warn("Export completeness could not be confirmed from cached lookahead snapshot");
                    truncated = true;
                    truncationReason = "unconfirmed_completeness";
                } else {
                    totalScanned += lookaheadSnapshot.docs.length;
                    if (!lookaheadSnapshot.empty) {
                        console.warn(`Export scan limit reached at ${totalScanned} documents`);
                        truncated = true;
                        truncationReason = "limit_exceeded";
                    }
                }
            } catch (err) {
                permissionDenied = isPermissionDeniedError(err);
                console.warn(
                    permissionDenied
                        ? "Export lookahead probe denied; marking export as unconfirmed:"
                        : "Export lookahead probe failed; marking export as unconfirmed:",
                    err
                );
                truncated = true;
                truncationReason = "unconfirmed_completeness";
            }
            break;
        }
    }

    // Firestore client SDK cursor queries lack a fixed readTime across pages, and pending local
    // writes can omit queued re-consults or reflect unacknowledged state.
    if (!truncated && (hasPendingWriteOverlap || batchCount > 1)) {
        truncated = true;
        truncationReason = "unconfirmed_completeness";
    }

    return {
        consults: allConsults,
        truncated,
        ...(truncationReason ? { truncationReason } : {}),
        ...(permissionDenied ? { permissionDenied } : {}),
    };
}

export async function getConsultById(id: string): Promise<Consult | undefined> {
    const database = requireDb();
    const docRef = doc(database, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return mapRawToConsult(docSnap.id, docSnap.data()) ?? undefined;
    }
    return undefined;
}

export interface AddConsultOptions {
    awaitRemote?: boolean;
    onBackgroundError?: (error: unknown, draft: Consult) => void;
    onBackgroundSuccess?: (consult: Consult) => void;
}

export async function addConsult(
    data: Omit<Consult, "id" | "createdAt">,
    options: AddConsultOptions = {}
): Promise<Consult> {
    const { awaitRemote = true, onBackgroundError, onBackgroundSuccess } = options;
    const database = requireDb();
    // Generate an ID for the new document using Firestore native doc()
    const newDocRef = doc(collection(database, COLLECTION_NAME));
    const newConsult: Consult = {
        ...data,
        id: newDocRef.id,
        createdAt: new Date().toISOString(),
    };

    if (!awaitRemote) {
        // Optimistic offline-first write: retain a retryable draft across navigation/reloads
        // until the Firestore write settles so hospital Wi-Fi drops never lose submissions.
        ensureDraftsHydrated();
        activeSubmitWriteIds.add(newConsult.id);
        retainedSubmitDrafts.set(newConsult.id, { consult: newConsult, status: "pending" });
        persistSubmitDrafts();
        const writePromise = trackOptimisticWrite(setDoc(newDocRef, newConsult));
        void writePromise.then(
            () => {
                activeSubmitWriteIds.delete(newConsult.id);
                retainedSubmitDrafts.delete(newConsult.id);
                persistSubmitDrafts();
                onBackgroundSuccess?.(newConsult);
            },
            (err) => {
                activeSubmitWriteIds.delete(newConsult.id);
                retainedSubmitDrafts.set(newConsult.id, {
                    consult: newConsult,
                    status: "failed",
                    error: err,
                });
                persistSubmitDrafts();
                onBackgroundError?.(err, newConsult);
            }
        );
        return newConsult;
    }

    await setDoc(newDocRef, newConsult);
    return newConsult;
}

type ConsultUpdate = UpdateData<Omit<Consult, "id">> | Partial<Omit<Consult, "id">>;
export type ConsultUpdater = (current: Consult) => ConsultUpdate | null;

export interface UpdateConsultOptions {
    awaitRemote?: boolean;
    onBackgroundError?: (error: unknown) => void;
}

export interface UpdateResults {
    consult: Consult | null;
    isQueued: boolean;
    backgroundPromise: Promise<void> | null;
    applied: boolean;
}

function buildOptimisticConsult(current: Consult, updates: ConsultUpdate): Consult | null {
    const hasDottedKeys = Object.keys(updates).some((k) => k.includes("."));
    return hasDottedKeys ? null : ({ ...current, ...updates } as Consult);
}

export async function updateConsult(
    id: string,
    updater: ConsultUpdater | ConsultUpdate,
    options: UpdateConsultOptions = {}
): Promise<UpdateResults> {
    const database = requireDb();
    const docRef = doc(database, COLLECTION_NAME, id);
    const { awaitRemote = true } = options;

    if (typeof updater === "function") {
        if (!awaitRemote) {
            // Optimistic Path: Return immediately after local read, then sync safely in background.
            // Note: getDoc usually hit the local cache first, so this is fast.
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                throw new Error(`Consult not found: ${id}`);
            }

            const currentData = mapRawToConsult(docSnap.id, docSnap.data());
            if (!currentData) {
                throw new Error(`Consult not found: ${id}`);
            }

            const updates = updater(currentData);
            if (updates === null) {
                return {
                    consult: null,
                    isQueued: false,
                    backgroundPromise: null,
                    applied: false,
                };
            }
            
            // Perform the "real" update in background (Allows Offline persistence)
            const rawPromise = trackOptimisticWrite(updateDoc(docRef, updates));
            rawPromise.catch(err => {
                console.error("Background sync failed for updateConsult:", err);
                if (options.onBackgroundError) {
                    options.onBackgroundError(err);
                }
            });

            return {
                consult: buildOptimisticConsult(currentData, updates),
                isQueued: true,
                backgroundPromise: rawPromise,
                applied: true,
            };
        }

        // Standard Path (Awaited for server response)
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            throw new Error(`Consult not found: ${id}`);
        }

        const currentData = mapRawToConsult(docSnap.id, docSnap.data());
        if (!currentData) {
            throw new Error(`Consult not found: ${id}`);
        }

        const updates = updater(currentData);
        if (updates === null) {
            return {
                consult: null,
                isQueued: false,
                backgroundPromise: null,
                applied: false,
            };
        }
        await updateDoc(docRef, updates);

        return {
            consult: buildOptimisticConsult(currentData, updates),
            isQueued: false,
            backgroundPromise: null,
            applied: true,
        };
    } else {
        // Direct object update
        if (!awaitRemote) {
            // FIRE AND FORGET
            const rawPromise = trackOptimisticWrite(updateDoc(docRef, updater));
            rawPromise.catch(e => {
                console.error("Delayed updateDoc error:", e);
                if (options.onBackgroundError) {
                    options.onBackgroundError(e);
                }
            });
            return {
                consult: null,
                isQueued: true,
                backgroundPromise: rawPromise,
                applied: true,
            };
        }
        await updateDoc(docRef, updater);
        return {
            consult: null,
            isQueued: false,
            backgroundPromise: null,
            applied: true,
        };
    }
}

/**
 * Atomic update using Firestore Transaction.
 * Use ONLY for critical race-condition-prone operations (e.g., case acceptance).
 *
 * Unlike updateConsult(), this function guarantees atomicity by reading and writing
 * within a single Firestore transaction. The trade-off is that transactions
 * REQUIRE network connectivity and will fail when offline.
 *
 * For offline-tolerant operations, use updateConsult() instead.
 */
export async function transactionalUpdateConsult(
    id: string,
    updater: ConsultUpdater,
    options: UpdateConsultOptions = {}
): Promise<UpdateResults> {
    const database = requireDb();
    const docRef = doc(database, COLLECTION_NAME, id);
    const { awaitRemote = true } = options;

    // For Optimistic UI: read local cache first for immediate UI response
    let optimisticConsult: Consult | null = null;
    let preApplied = false;

    if (!awaitRemote) {
        // Pre-read for optimistic response (may hit local cache)
        const preSnap = await getDoc(docRef);
        if (preSnap.exists()) {
            const preData = mapRawToConsult(preSnap.id, preSnap.data());
            if (preData) {
                const preUpdates = updater(preData);
                if (preUpdates !== null) {
                    preApplied = true;
                    optimisticConsult = buildOptimisticConsult(preData, preUpdates);
                }
            }
        }

        if (!preApplied) {
            // Local precondition failed — do not fire a doomed background write
            return {
                consult: null,
                isQueued: false,
                backgroundPromise: null,
                applied: false,
            };
        }
    }

    const transactionWork = async (): Promise<{ applied: boolean; consult: Consult | null }> => {
        return runTransaction(database, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            if (!docSnap.exists()) {
                throw new Error(`Consult not found: ${id}`);
            }

            const currentData = mapRawToConsult(docSnap.id, docSnap.data());
            if (!currentData) {
                throw new Error(`Consult not found: ${id}`);
            }

            const updates = updater(currentData);
            if (updates === null) {
                // Condition not met (e.g., already accepted by another user)
                // Do NOT write, do NOT throw — just signal "not applied"
                return { applied: false, consult: null };
            }

            transaction.update(docRef, updates);

            return {
                applied: true,
                consult: buildOptimisticConsult(currentData, updates),
            };
        });
    };

    if (!awaitRemote) {
        // Fire transaction in background, return optimistic result immediately
        const backgroundPromise = trackOptimisticWrite(transactionWork().then(result => {
            if (!result.applied) {
                // Transaction succeeded but condition was not met — another user got there first
                const abortError = new Error("TRANSACTION_CONDITION_NOT_MET");
                if (options.onBackgroundError) {
                    options.onBackgroundError(abortError);
                }
            }
        }).catch(err => {
            console.error("Background transaction failed:", err);
            if (options.onBackgroundError) {
                options.onBackgroundError(err);
            }
        }));

        // Attach no-op catch to prevent unhandled rejection warning
        void backgroundPromise;

        return {
            consult: optimisticConsult,
            isQueued: true,
            backgroundPromise,
            applied: preApplied,
        };
    }

    // Awaited path: run transaction and wait for server confirmation
    const result = await transactionWork();
    return {
        consult: result.consult,
        isQueued: false,
        backgroundPromise: null,
        applied: result.applied,
    };
}

export async function transferConsultRoom(
    id: string,
    newRoom: RoomName,
    onBackgroundError?: (error: unknown) => void
): Promise<{ transferred: boolean; backgroundPromise: Promise<void> | null }> {
    const now = new Date().toISOString();
    const result = await updateConsult(id, (current) => {
        if (current.room === newRoom) return null;

        const pendingDeptKeys = Object.keys(current.departments).filter(
            (deptKey) => current.departments[deptKey].status === "pending"
        );
        
        if (pendingDeptKeys.length === 0) return null;

        const payload: ConsultUpdate = {
            room: newRoom
        };
        
        // Add transfer milestone to all departments that are still pending
        pendingDeptKeys.forEach((deptKey) => {
            const key = `departments.${deptKey}.transfers`;
            (payload as Record<string, unknown>)[key] = arrayUnion({ to: newRoom, at: now });
        });

        return payload;
    }, {
        awaitRemote: false,
        onBackgroundError,
    });

    return {
        transferred: result.applied,
        backgroundPromise: result.backgroundPromise,
    };
}
