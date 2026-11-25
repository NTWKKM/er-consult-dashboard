import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, getDocFromCache, getDocFromServer, updateDoc, runTransaction, query, where, orderBy, onSnapshot, limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData, arrayUnion, type DocumentReference, type Firestore, type QueryConstraint, type UpdateData } from "firebase/firestore";
import { sortConsults } from "./utils";
import { getUtcRangeForLocalDate } from "./dateUtils";
import { RoomName } from "./constants";
import { ConsultSchema, type Consult, type ConsultDepartment, type ConsultTransfer } from "./schema";
import { isSubmissionBlockedByLogout } from "./logoutReservation";
import { ZodError } from "zod";

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
    replacesDraftId?: string;
}

const retainedSubmitDrafts = new Map<string, RetainedSubmitDraft>();
const activeSubmitWriteIds = new Set<string>();
const draftTokens = new Map<string, number>();
let submitDraftGeneration = 0;
let nextDraftToken = 0;
const failedDraftListeners = new Set<(draft: Consult, error?: unknown) => void>();
const LEGACY_SUBMIT_DRAFTS_STORAGE_KEY = "er_consult_submit_drafts_v1";

/**
 * Removes any legacy persisted submit drafts left in sessionStorage from older app builds.
 */
export function clearLegacySubmitDraftStorage(): void {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.removeItem(LEGACY_SUBMIT_DRAFTS_STORAGE_KEY);
    } catch {
        // Ignore restricted Web Storage environments
    }
}

clearLegacySubmitDraftStorage();

export function hasRetainedSubmitDrafts(): boolean {
    return retainedSubmitDrafts.size > 0;
}

export function subscribeToFailedSubmitDrafts(
    listener: (draft: Consult, error?: unknown) => void
): () => void {
    failedDraftListeners.add(listener);
    return () => {
        failedDraftListeners.delete(listener);
    };
}

function notifyFailedDraftListeners(draft: Consult, error?: unknown): number {
    let notified = 0;
    for (const listener of failedDraftListeners) {
        notified += 1;
        try {
            listener(draft, error);
        } catch {
            // Isolate listener errors
        }
    }
    return notified;
}

function retireSupersededDraft(replacesDraftId: string | undefined, replacementId: string): void {
    if (!replacesDraftId || replacesDraftId === replacementId) return;
    retainedSubmitDrafts.delete(replacesDraftId);
    activeSubmitWriteIds.delete(replacesDraftId);
    draftTokens.delete(replacesDraftId);
}

export function getLatestFailedSubmitDraft(): Consult | null {
    const supersededByPending = new Set<string>();
    for (const entry of retainedSubmitDrafts.values()) {
        if (entry.status === "pending" && entry.replacesDraftId) {
            supersededByPending.add(entry.replacesDraftId);
        }
    }
    let latest: Consult | null = null;
    for (const entry of retainedSubmitDrafts.values()) {
        if (entry.status === "failed" && !supersededByPending.has(entry.consult.id)) {
            latest = entry.consult;
        }
    }
    return latest;
}

export function getRetainedSubmitDraft(id: string): RetainedSubmitDraft | undefined {
    return retainedSubmitDrafts.get(id);
}

export function clearRetainedSubmitDraft(id?: string): void {
    clearLegacySubmitDraftStorage();
    if (id === undefined) {
        submitDraftGeneration += 1;
        retainedSubmitDrafts.clear();
        activeSubmitWriteIds.clear();
        draftTokens.clear();
        return;
    }
    retainedSubmitDrafts.delete(id);
    activeSubmitWriteIds.delete(id);
    draftTokens.delete(id);
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
    replacesDraftId?: string;
    onBackgroundError?: (
        error: unknown,
        draft: Consult,
        context?: { notifiedListenerCount: number }
    ) => void;
    onBackgroundSuccess?: (consult: Consult) => void;
}

export async function addConsult(
    data: Omit<Consult, "id" | "createdAt">,
    options: AddConsultOptions = {}
): Promise<Consult> {
    if (isSubmissionBlockedByLogout()) {
        throw new Error("กำลังออกจากระบบ กรุณารอสักครู่หรือรีเฟรชหน้าก่อนส่งเคสใหม่");
    }
    const { awaitRemote = true, replacesDraftId, onBackgroundError, onBackgroundSuccess } = options;
    const database = requireDb();
    // Generate an ID for the new document using Firestore native doc()
    const newDocRef = doc(collection(database, COLLECTION_NAME));
    const newConsult: Consult = {
        ...data,
        id: newDocRef.id,
        createdAt: new Date().toISOString(),
    };

    if (!awaitRemote) {
        // Optimistic offline-first write: retain a retryable draft in memory during the active
        // session without writing plaintext PHI into Web Storage.
        const captureGeneration = submitDraftGeneration;
        const captureToken = ++nextDraftToken;
        draftTokens.set(newConsult.id, captureToken);
        activeSubmitWriteIds.add(newConsult.id);
        retainedSubmitDrafts.set(newConsult.id, {
            consult: newConsult,
            status: "pending",
            ...(replacesDraftId ? { replacesDraftId } : {}),
        });

        const isStillOwned = () =>
            submitDraftGeneration === captureGeneration &&
            draftTokens.get(newConsult.id) === captureToken &&
            retainedSubmitDrafts.has(newConsult.id);

        const writePromise = trackOptimisticWrite(setDoc(newDocRef, newConsult));
        void writePromise.then(
            () => {
                activeSubmitWriteIds.delete(newConsult.id);
                if (!isStillOwned()) return;
                retainedSubmitDrafts.delete(newConsult.id);
                draftTokens.delete(newConsult.id);
                retireSupersededDraft(replacesDraftId, newConsult.id);
                onBackgroundSuccess?.(newConsult);
            },
            (err) => {
                activeSubmitWriteIds.delete(newConsult.id);
                if (!isStillOwned()) return;
                retainedSubmitDrafts.set(newConsult.id, {
                    consult: newConsult,
                    status: "failed",
                    error: err,
                    ...(replacesDraftId ? { replacesDraftId } : {}),
                });
                retireSupersededDraft(replacesDraftId, newConsult.id);
                const notifiedListenerCount = failedDraftListeners.size;
                onBackgroundError?.(err, newConsult, { notifiedListenerCount });
                notifyFailedDraftListeners(newConsult, err);
            }
        );
        return newConsult;
    }

    await trackOptimisticWrite(setDoc(newDocRef, newConsult));
    return newConsult;
}

type ConsultUpdate = UpdateData<Omit<Consult, "id">> | Partial<Omit<Consult, "id">>;
export type ConsultUpdater = (current: Consult) => ConsultUpdate | null;

export interface UpdateConsultOptions {
    awaitRemote?: boolean;
    onBackgroundError?: (error: unknown) => void;
    scheduleTransaction?: <T>(fn: () => Promise<T>) => Promise<T>;
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

/**
 * Reads local persistent cache first when available to avoid redundant server reads
 * and network stalls on offline/optimistic paths, falling back to getDoc on cache miss.
 */
async function readConsultSnapshotCacheFirst(docRef: DocumentReference<DocumentData>) {
    try {
        if (typeof getDocFromCache === "function") {
            const cachedSnap = await getDocFromCache(docRef);
            if (cachedSnap.exists()) {
                return { snap: cachedSnap, fromCache: true };
            }
        }
    } catch {
        // Cache miss, unavailable, or partial test mock — fall back to server/getDoc
    }
    const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    return {
        snap: isOnline ? await readConsultSnapshotServerOnly(docRef) : await getDoc(docRef),
        fromCache: false,
    };
}

/**
 * Forces a server-authoritative read when online so Firestore does not silently serve
 * local cache during backend unavailability.
 */
async function readConsultSnapshotServerOnly(docRef: DocumentReference<DocumentData>) {
    let serverGetter: typeof getDocFromServer | undefined;
    try {
        if (typeof getDocFromServer === "function") {
            serverGetter = getDocFromServer;
        }
    } catch {
        // Partial test mock without getDocFromServer export — fall back to mocked getDoc
    }
    if (serverGetter) {
        return serverGetter(docRef);
    }
    return getDoc(docRef);
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
            // Read local cache only when offline; when online, read from server so
            // authoritative remote state (e.g. department completed elsewhere) is respected.
            const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
            const docSnap = isOffline
                ? (await readConsultSnapshotCacheFirst(docRef)).snap
                : await readConsultSnapshotServerOnly(docRef);
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
        // Pre-read from local cache first so transactional writes avoid double server reads
        const initialRead = await readConsultSnapshotCacheFirst(docRef);
        const evaluatePreSnap = (snap: typeof initialRead.snap) => {
            if (!snap.exists()) return;
            const preData = mapRawToConsult(snap.id, snap.data());
            if (!preData) return;
            const preUpdates = updater(preData);
            if (preUpdates !== null) {
                preApplied = true;
                optimisticConsult = buildOptimisticConsult(preData, preUpdates);
            }
        };

        evaluatePreSnap(initialRead.snap);

        // If cache failed the precondition while online, check authoritative server state once
        // before short-circuiting (e.g. stale cache missing a re-consult or room change).
        const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
        if (!preApplied && initialRead.fromCache && isOnline) {
            const serverSnap = await readConsultSnapshotServerOnly(docRef);
            evaluatePreSnap(serverSnap);
        }

        if (!preApplied) {
            // Precondition failed — do not fire a doomed background write
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
        const runScheduledTransaction = options.scheduleTransaction
            ? () => options.scheduleTransaction!(transactionWork)
            : transactionWork;
        const backgroundPromise = trackOptimisticWrite(runScheduledTransaction().then(result => {
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

const latestTransferEpochByCaseId = new Map<string, number>();
const pendingTransferTailByCaseId = new Map<string, Promise<void>>();
let transferEpochSeq = 0;

function enqueueCaseTransfer<T>(caseId: string, task: () => Promise<T>): Promise<T> {
    const prev = pendingTransferTailByCaseId.get(caseId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(task);
    const tail = run.then(
        () => {},
        () => {}
    );
    pendingTransferTailByCaseId.set(caseId, tail);
    void tail.then(() => {
        if (pendingTransferTailByCaseId.get(caseId) === tail) {
            pendingTransferTailByCaseId.delete(caseId);
        }
    });
    return run;
}

function isRetryableTransferError(err: unknown): boolean {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
    const code =
        typeof err === "object" && err !== null && "code" in err
            ? String((err as { code?: unknown }).code).toLowerCase()
            : "";
    if (
        code.includes("unavailable") ||
        code.includes("aborted") ||
        code.includes("deadline-exceeded")
    ) {
        return true;
    }
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    return (
        msg.includes("offline") ||
        msg.includes("network") ||
        msg.includes("unavailable") ||
        msg.includes("timeout")
    );
}

function waitForOnlineReconnect(): Promise<void> {
    if (
        typeof window === "undefined" ||
        typeof navigator === "undefined" ||
        navigator.onLine !== false
    ) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        const handleOnline = () => {
            window.removeEventListener("online", handleOnline);
            resolve();
        };
        window.addEventListener("online", handleOnline);
        if (navigator.onLine !== false) {
            window.removeEventListener("online", handleOnline);
            resolve();
        }
    });
}

export async function transferConsultRoom(
    id: string,
    newRoom: RoomName,
    onBackgroundError?: (error: unknown) => void
): Promise<{
    transferred: boolean;
    backgroundPromise: Promise<void> | null;
    isOfflineQueued: boolean;
}> {
    const now = new Date().toISOString();
    const requestEpoch = ++transferEpochSeq;
    let ownershipClaimed = false;
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    const buildTransferPayload = (current: Consult): ConsultUpdate | null => {
        if (ownershipClaimed && latestTransferEpochByCaseId.get(id) !== requestEpoch) {
            return null;
        }
        if (current.room === newRoom) return null;

        const pendingDeptKeys = Object.keys(current.departments).filter(
            (deptKey) => current.departments[deptKey].status === "pending"
        );
        
        if (pendingDeptKeys.length === 0) return null;

        if (!ownershipClaimed) {
            const currentLatest = latestTransferEpochByCaseId.get(id) ?? 0;
            if (requestEpoch < currentLatest) {
                return null;
            }
            ownershipClaimed = true;
            latestTransferEpochByCaseId.set(id, requestEpoch);
        }

        const payload: ConsultUpdate = {
            room: newRoom
        };
        
        // Add transfer milestone to all departments that are still pending
        pendingDeptKeys.forEach((deptKey) => {
            const key = `departments.${deptKey}.transfers`;
            (payload as Record<string, unknown>)[key] = arrayUnion({ to: newRoom, at: now });
        });

        return payload;
    };

    if (isOffline) {
        // Pre-validate locally from cache, then queue a session-scoped reconnect intent
        // ordered by requestEpoch so newer transfers supersede older ones and server-side
        // pending-department preconditions are re-evaluated transactionally upon reconnect.
        const database = requireDb();
        const docRef = doc(database, COLLECTION_NAME, id);
        const { snap } = await readConsultSnapshotCacheFirst(docRef);
        if (!snap.exists()) {
            throw new Error(`Consult not found: ${id}`);
        }
        const currentData = mapRawToConsult(snap.id, snap.data());
        if (!currentData) {
            throw new Error(`Consult not found: ${id}`);
        }
        if (buildTransferPayload(currentData) === null) {
            return {
                transferred: false,
                backgroundPromise: null,
                isOfflineQueued: false,
            };
        }

        const runDeferredTransfer = async (): Promise<void> => {
            const maxRetryAttempts = 3;
            let retryCount = 0;
            while (latestTransferEpochByCaseId.get(id) === requestEpoch) {
                await waitForOnlineReconnect();
                if (latestTransferEpochByCaseId.get(id) !== requestEpoch) return;
                try {
                    const txResult = await enqueueCaseTransfer(id, async () => {
                        if (latestTransferEpochByCaseId.get(id) !== requestEpoch) {
                            return {
                                consult: null,
                                isQueued: false,
                                backgroundPromise: null,
                                applied: false,
                            };
                        }
                        return transactionalUpdateConsult(id, buildTransferPayload, {
                            awaitRemote: true,
                        });
                    });
                    if (!txResult.applied && latestTransferEpochByCaseId.get(id) === requestEpoch) {
                        onBackgroundError?.(new Error("TRANSACTION_CONDITION_NOT_MET"));
                    }
                    return;
                } catch (err) {
                    if (latestTransferEpochByCaseId.get(id) !== requestEpoch) return;
                    if (isRetryableTransferError(err) && retryCount < maxRetryAttempts) {
                        retryCount += 1;
                        if (typeof navigator !== "undefined" && navigator.onLine !== false) {
                            await new Promise((r) => setTimeout(r, Math.min(250 * retryCount, 1000)));
                        }
                        continue;
                    }
                    console.error("Deferred offline transfer failed:", err);
                    onBackgroundError?.(err);
                    return;
                }
            }
        };

        const reconnectPromise = trackOptimisticWrite(runDeferredTransfer());
        void reconnectPromise;

        return {
            transferred: true,
            backgroundPromise: reconnectPromise,
            isOfflineQueued: true,
        };
    }

    const result = await transactionalUpdateConsult(id, buildTransferPayload, {
        awaitRemote: false,
        onBackgroundError,
        scheduleTransaction: (fn) =>
            enqueueCaseTransfer(id, async () => {
                if (latestTransferEpochByCaseId.get(id) !== requestEpoch) {
                    return { applied: false, consult: null } as Awaited<ReturnType<typeof fn>>;
                }
                return fn();
            }),
    });

    return {
        transferred: result.applied,
        backgroundPromise: result.backgroundPromise,
        isOfflineQueued: false,
    };
}
