import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { sortConsults } from "./utils";

export interface ConsultDepartment {
    status: "pending" | "completed" | "cancelled";
    completedAt: string | null;
    acceptedAt?: string | null;
    actionStatus?: string;
    admittedAt?: string | null;
    returnedAt?: string | null;
    dischargedAt?: string | null;
}

export interface Consult {
    id: string;
    hn: string;
    firstName: string;
    lastName: string;
    room: string;
    problem: string;
    createdAt: string; // ISO string
    status: "pending" | "completed";
    isUrgent: boolean;
    departments: { [key: string]: ConsultDepartment };
}

const COLLECTION_NAME = "consults";

/**
 * Helper to map a Firestore document snapshot to a Consult object.
 * Performs defensive checks and provides default values.
 */
function mapDocToConsult(document: QueryDocumentSnapshot<DocumentData>): Consult | null {
    const data = document.data();
    if (!data) return null;
    return {
        ...data,
        id: document.id,
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
    } as Consult;
}

/**
 * Helper to get the UTC ISO range [start, end) for a given local "YYYY-MM-DD" date.
 */
/**
 * Helper to get the UTC ISO range [start, end) for a given local "YYYY-MM-DD" date.
 * Accepts an optional offsetMinutes (positive for West, negative for East, same as Date.getTimezoneOffset())
 * to compute the UTC boundary correctly for the user's local day.
 * If not provided, computes the offset for the target date itself to handle DST correctly.
 */
function getUtcRangeForLocalDate(date: string, offsetMinutes?: number) {
    const [year, month, day] = date.split("-").map(Number);

    // If no offset provided, compute it for the target date to handle DST correctly
    if (offsetMinutes === undefined) {
        const targetDate = new Date(year, month - 1, day);
        offsetMinutes = targetDate.getTimezoneOffset();
    }

    // Use Date.UTC constructor with the offset to get the exact UTC moment for local midnight
    const start = new Date(Date.UTC(year, month - 1, day, 0, offsetMinutes));
    const end = new Date(Date.UTC(year, month - 1, day + 1, 0, offsetMinutes));
    return { start: start.toISOString(), end: end.toISOString() };
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
            if (consult) consults.push(consult);
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
    let q = query(
        collection(db, COLLECTION_NAME),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc"),
        limit(pageSize + 1) // fetch one extra to check if there are more
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

    const consults: Consult[] = pageDocs
        .map(mapDocToConsult)
        .filter((c): c is Consult => c !== null && Boolean(c.hn));


    return {
        consults,
        lastDoc: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
        hasMore,
    };
}

/**
 * Search completed consults by exact HN or date range.
 * This provides server-side filtering to bypass pagination limitations.
 */
export async function searchCompletedConsults(
    searchHN?: string,
    filterDate?: string,
    timezoneOffset?: number
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
            const { start, end } = getUtcRangeForLocalDate(filterDate, timezoneOffset);
            consults = consults.filter(c => c.createdAt && c.createdAt >= start && c.createdAt < end);
        }

        return consults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // If only filtering by date, use the existing status + createdAt index
    if (filterDate) {
        const { start, end } = getUtcRangeForLocalDate(filterDate, timezoneOffset);
        
        const q = query(
            collection(db, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", start),
            where("createdAt", "<", end),
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
    endDate: string,
    timezoneOffset?: number
): Promise<Consult[]> {
    const { start } = getUtcRangeForLocalDate(startDate, timezoneOffset);
    const { end } = getUtcRangeForLocalDate(endDate, timezoneOffset);

    let allConsults: Consult[] = [];
    let lastDoc: QueryDocumentSnapshot < DocumentData > | null = null;
    const BATCH_SIZE = 1000;
    const MAX_RESULTS = 50000;

    while (true) {
        let q = query(
            collection(db, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", start),
            where("createdAt", "<", end),
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

        allConsults = allConsults.concat(batch);

        // Safety limit to prevent unbounded memory growth
        if (allConsults.length >= MAX_RESULTS) {
            allConsults = allConsults.slice(0, MAX_RESULTS);
            console.warn(`Export truncated at ${MAX_RESULTS} results`);
            break;
        }

        // If we fetched fewer than batch size, we've reached the end
        if (snapshot.docs.length < BATCH_SIZE) break;

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return allConsults;
}

export async function getConsultById(id: string): Promise<Consult | undefined> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            ...data,
            id: docSnap.id,
            firstName: data.firstName ?? "",
            lastName: data.lastName ?? "",
        } as Consult;
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

export type ConsultUpdater = (current: Consult) => Partial<Omit<Consult, "id">>;

export async function updateConsult(
    id: string,
    updater: ConsultUpdater | Partial<Omit<Consult, "id">>
): Promise<Consult | null> {
    const docRef = doc(db, COLLECTION_NAME, id);

    let updates: Partial<Omit<Consult, "id">>;

    if (typeof updater === "function") {
        // Read current data, compute updates, then apply
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            throw new Error(`Consult not found: ${id}`);
        }

        const currentData = {
            ...docSnap.data(),
            id: docSnap.id,
            firstName: docSnap.data().firstName ?? "",
            lastName: docSnap.data().lastName ?? "",
        } as Consult;

        updates = updater(currentData);

        await updateDoc(docRef, updates);

        return {
            ...currentData,
            ...updates,
        } as Consult;
    } else {
        // Direct object update
        updates = updater;
        await updateDoc(docRef, updates);
        return null;
    }
}

export async function deleteConsult(id: string, allowMissing: boolean = false): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);

    if (!allowMissing) {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            throw new Error(`Consult not found: ${id}`);
        }
    }

    await deleteDoc(docRef);
}