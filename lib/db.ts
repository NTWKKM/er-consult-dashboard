import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, updateDoc, query, where, orderBy, onSnapshot, limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData, arrayUnion, type UpdateData } from "firebase/firestore";
import { sortConsults } from "./utils";
import { getUtcRangeForLocalDate } from "./dateUtils";
import { ROOMS, RoomName } from "./constants";

export interface ConsultTransfer {
    to: RoomName;
    at: string; // ISO string
}

export interface ConsultDepartment {
    status: "pending" | "completed" | "cancelled";
    completedAt: string | null;
    acceptedAt?: string | null;
    actionStatus?: string;
    admittedAt?: string | null;
    returnedAt?: string | null;
    dischargedAt?: string | null;
    transfers?: ConsultTransfer[];
}

export interface Consult {
    id: string;
    hn: string;
    firstName: string;
    lastName: string;
    room: RoomName;
    problem: string;
    createdAt: string; // ISO string
    status: "pending" | "completed";
    isUrgent: boolean;
    departments: { [key: string]: ConsultDepartment };
}

const COLLECTION_NAME = "consults";

/**
 * Runtime validator to ensure room names from schemaless Firestore data 
 * match the defined RoomName type.
 */
function isValidRoomName(room: unknown): room is RoomName {
    return typeof room === "string" && (ROOMS as readonly string[]).includes(room);
}

/**
 * Sanitizes and validates raw Firestore data into a Consult object.
 */
function mapRawToConsult(id: string, data: DocumentData): Consult | null {
    if (!data) return null;

    // Validate and fallback for the main room field
    let room: RoomName = ROOMS[0]; // Default to first valid room
    if (isValidRoomName(data.room)) {
        room = data.room;
    } else if (data.room !== undefined) {
        console.warn(`[mapRawToConsult] Invalid room "${data.room}" for consult ${id}, defaulting to ${ROOMS[0]}`);
    }

    // Deeply validate and sanitize transfers in all departments
    const validatedDepts: { [key: string]: ConsultDepartment } = {};
    if (data.departments) {
        Object.keys(data.departments).forEach(deptKey => {
            const dept = data.departments[deptKey];
            const validatedDept: ConsultDepartment = { ...dept };
            
            if (dept.transfers && Array.isArray(dept.transfers)) {
                validatedDept.transfers = dept.transfers.map((t: unknown, index: number) => {
                    const transfer = t as Record<string, unknown>;
                    const isValidTo = isValidRoomName(transfer.to);
                    if (!isValidTo && transfer.to !== undefined) {
                        console.warn(`[mapRawToConsult] Invalid transfer destination "${transfer.to}" at index ${index} for dept ${deptKey} in consult ${id}`);
                    }
                    return {
                        at: typeof transfer.at === "string" ? transfer.at : new Date().toISOString(),
                        to: isValidTo ? transfer.to : room // Use main room as fallback for invalid transfer
                    };
                });
            }
            
            validatedDepts[deptKey] = validatedDept;
        });
    }

    return {
        ...data,
        id,
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        room,
        departments: validatedDepts,
    } as Consult;
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
    // Track both valid consults and their corresponding Firestore docs.
    // validDocs[i] is the snapshot for validConsults[i], enabling correct cursor tracking.
    const validConsults: Consult[] = [];
    const validDocs: QueryDocumentSnapshot<DocumentData>[] = [];
    let currentCursor = lastDoc;
    let hasMore = false;

    // ดึงข้อมูลไปเรื่อยๆ จนกว่าจะได้เอกสารที่ถูกต้องครบ pageSize + 1 (เพื่อเช็ค hasMore)
    while (validConsults.length <= pageSize) {
        let q = query(
            collection(db, COLLECTION_NAME),
            where("status", "==", "completed"),
            orderBy("createdAt", "desc"),
            limit(pageSize + 1 - validConsults.length)
        );

        if (currentCursor) {
            q = query(q, startAfter(currentCursor));
        }

        const snapshot = await getDocs(q);
        if (snapshot.empty) break;

        snapshot.docs.forEach((doc) => {
            if (validConsults.length <= pageSize) {
                const c = mapDocToConsult(doc);
                if (c !== null && Boolean(c.hn)) {
                    validConsults.push(c);
                    validDocs.push(doc);
                }
            }
        });

        currentCursor = snapshot.docs[snapshot.docs.length - 1];
    }

    hasMore = validConsults.length > pageSize;
    const pageConsults = hasMore ? validConsults.slice(0, pageSize) : validConsults;
    const pageLastDoc = pageConsults.length > 0 ? validDocs[pageConsults.length - 1] : null;

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
export async function searchCompletedConsults(
    searchHN?: string,
    filterDate?: string
): Promise<Consult[]> {
    let consults: Consult[] = [];

    // If searching by HN, query by exact HN with server-side status filter.
    // NOTE: Queries on "hn" may require a composite index if you later add ordering
    // or additional where clauses beyond status filtering.
    if (searchHN) {
        const q = query(
            collection(db, COLLECTION_NAME),
            where("hn", ">=", searchHN),
            where("hn", "<", searchHN + "\uf8ff"),
            where("status", "==", "completed")
        );
        const snapshot = await getDocs(q);

        consults = snapshot.docs
            .map(mapDocToConsult)
            .filter((c): c is Consult => c !== null && Boolean(c.hn));


        if (filterDate) {
            const { start, endExclusive } = getUtcRangeForLocalDate(filterDate);
            consults = consults.filter(c => c.createdAt && c.createdAt >= start && c.createdAt < endExclusive);
        }

        return consults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // If only filtering by date, use the existing status + createdAt index
    if (filterDate) {
        const { start, endExclusive } = getUtcRangeForLocalDate(filterDate);
        
        const q = query(
            collection(db, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", start),
            where("createdAt", "<", endExclusive),
            orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(mapDocToConsult)
            .filter((c): c is Consult => c !== null && Boolean(c.hn));

    }

    return [];
}

/**
 * Fetch all completed cases within a date range (for exporting).
 * Uses cursor-based pagination internally to fetch the entire result set.
 */
export async function fetchAllCompletedConsultsForExport(
    startDate: string,
    endDate: string
): Promise<{ consults: Consult[]; truncated: boolean }> {
    const { start } = getUtcRangeForLocalDate(startDate);
    const { endExclusive } = getUtcRangeForLocalDate(endDate);

    let allConsults: Consult[] = [];
    let lastDoc: QueryDocumentSnapshot < DocumentData > | null = null;
    let truncated = false;
    const BATCH_SIZE = 1000;
    const MAX_RESULTS = 50000;

    while (true) {
        let q = query(
            collection(db, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", start),
            where("createdAt", "<", endExclusive),
            orderBy("createdAt", "desc"),
            limit(BATCH_SIZE)
        );

        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        if (snapshot.empty) break;

        const batch = snapshot.docs
            .map(mapDocToConsult)
            .filter((c): c is Consult => c !== null && Boolean(c.hn));

        allConsults.push(...batch);

        // Safety limit to prevent unbounded memory growth
        if (allConsults.length > MAX_RESULTS) {
            allConsults = allConsults.slice(0, MAX_RESULTS);
            console.warn(`Export truncated at ${MAX_RESULTS} results`);
            truncated = true;
            break;
        }

        // If we fetched fewer than batch size, we've reached the end
        if (snapshot.docs.length < BATCH_SIZE) break;

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return {
        consults: allConsults,
        truncated
    };
}

export async function getConsultById(id: string): Promise<Consult | undefined> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return mapRawToConsult(docSnap.id, docSnap.data()) ?? undefined;
    }
    return undefined;
}

export async function addConsult(data: Omit<Consult, "id" | "createdAt">): Promise<Consult> {
    // Generate an ID for the new document using Firestore native doc()
    const newDocRef = doc(collection(db, COLLECTION_NAME));
    const newConsult: Consult = {
        ...data,
        id: newDocRef.id,
        createdAt: new Date().toISOString(),
    };
    
    await setDoc(newDocRef, newConsult);
    return newConsult;
}

type ConsultUpdate = UpdateData<Omit<Consult, "id">>;
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

export async function updateConsult(
    id: string,
    updater: ConsultUpdater | ConsultUpdate,
    options: UpdateConsultOptions = {}
): Promise<UpdateResults> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const { awaitRemote = true } = options;

    if (typeof updater === "function") {
        if (!awaitRemote) {
            // Optimistic Path: Return immediately after local read, then sync safely in background.
            // Note: getDoc usually hit the local cache first, so this is fast.
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                throw new Error(`Consult not found: ${id}`);
            }

            const data = docSnap.data();
            const currentData = {
                ...data,
                id: docSnap.id,
                firstName: data?.firstName ?? "",
                lastName: data?.lastName ?? "",
            } as Consult;

            const updates = updater(currentData);
            if (updates === null) {
                return {
                    consult: null,
                    isQueued: false,
                    backgroundPromise: null,
                    applied: false,
                };
            }
            
            const hasDottedKeys = Object.keys(updates).some(k => k.includes("."));
            
            // Perform the "real" update in background (Allows Offline persistence)
            const rawPromise = updateDoc(docRef, updates);
            rawPromise.catch(err => {
                console.error("Background sync failed for updateConsult:", err);
                if (options.onBackgroundError) {
                    options.onBackgroundError(err);
                }
            });

            return {
                consult: hasDottedKeys ? null : {
                    ...currentData,
                    ...updates,
                } as Consult,
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

        const data = docSnap.data();
        const currentData = {
            ...data,
            id: docSnap.id,
            firstName: data?.firstName ?? "",
            lastName: data?.lastName ?? "",
        } as Consult;

        const updates = updater(currentData);
        if (updates === null) {
            return {
                consult: null,
                isQueued: false,
                backgroundPromise: null,
                applied: false,
            };
        }
        const hasDottedKeys = Object.keys(updates).some(k => k.includes("."));
        await updateDoc(docRef, updates);

        return {
            consult: hasDottedKeys ? null : {
                ...currentData,
                ...updates,
            } as Consult,
            isQueued: false,
            backgroundPromise: null,
            applied: true,
        };
    } else {
        // Direct object update
        if (!awaitRemote) {
            // FIRE AND FORGET
            const rawPromise = updateDoc(docRef, updater);
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
