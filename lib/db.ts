import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { sortConsults } from "./utils";

export interface ConsultDepartment {
    status: "pending" | "completed";
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
            const data = document.data();
            consults.push({
                id: document.id,
                firstName: data.firstName || "",
                lastName: data.lastName || "",
                ...data,
            } as Consult);
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

    const consults: Consult[] = pageDocs.map((document) => {
        const data = document.data();
        return {
            id: document.id,
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            ...data,
        } as Consult;
    });

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
    filterDate?: string
): Promise<Consult[]> {
    let consults: Consult[] = [];

    // If searching by HN, query by exact HN first, then filter completed/date locally.
    // This avoids requiring a new composite index.
    if (searchHN) {
        const q = query(
            collection(db, COLLECTION_NAME),
            where("hn", "==", searchHN)
        );
        const snapshot = await getDocs(q);
        
        consults = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Consult))
            .filter(c => c.status === "completed");

        if (filterDate) {
            consults = consults.filter(c => c.createdAt && c.createdAt.startsWith(filterDate));
        }

        return consults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // If only filtering by date, use the existing status + createdAt index
    if (filterDate) {
        const startStr = filterDate + "T00:00:00.000Z";
        const endStr = filterDate + "T23:59:59.999Z";
        
        const q = query(
            collection(db, COLLECTION_NAME),
            where("status", "==", "completed"),
            where("createdAt", ">=", startStr),
            where("createdAt", "<=", endStr),
            orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Consult));
    }

    return [];
}

/**
 * Fetch all completed cases within a date range (for exporting).
 */
export async function fetchAllCompletedConsultsForExport(
    startDate: string,
    endDate: string,
    maxResults: number = 10000
): Promise<Consult[]> {
    const startStr = startDate + "T00:00:00.000Z";
    const endStr = endDate + "T23:59:59.999Z";

    const q = query(
        collection(db, COLLECTION_NAME),
        where("status", "==", "completed"),
        where("createdAt", ">=", startStr),
        where("createdAt", "<=", endStr),
        orderBy("createdAt", "desc"),
        limit(maxResults)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Consult));
}

export async function getConsultById(id: string): Promise<Consult | undefined> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            ...data,
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

export async function updateConsult(
    id: string,
    updates: Partial<Omit<Consult, "id">>
): Promise<Consult | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;

    await updateDoc(docRef, updates);
    
    return { id, ...docSnap.data(), ...updates } as Consult;
}

export async function deleteConsult(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
}
