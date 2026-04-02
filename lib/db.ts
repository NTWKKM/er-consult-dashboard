import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, updateDoc, query, where, orderBy, onSnapshot, limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
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
