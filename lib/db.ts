import { db } from "./firebase";
import crypto from "crypto";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy } from "firebase/firestore";

export interface ConsultDepartment {
    status: "pending" | "completed";
    completedAt: string | null;
    acceptedAt?: string | null;
}

export interface Consult {
    id: string;
    hn: string;
    room: string;
    problem: string;
    createdAt: string; // ISO string
    status: "pending" | "completed";
    isUrgent: boolean;
    departments: { [key: string]: ConsultDepartment };
}

const COLLECTION_NAME = "consults";

export async function getConsultsByStatus(status: "pending" | "completed"): Promise<Consult[]> {
    const q = query(
        collection(db, COLLECTION_NAME),
        where("status", "==", status),
        orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    const consults: Consult[] = [];
    querySnapshot.forEach((document) => {
        consults.push({ id: document.id, ...document.data() } as Consult);
    });
    
    // Perform memory sort to prioritize urgent cases first
    // Note: Doing this in JS avoids needing a composite index in Firestore during early setup.
    return consults.sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        // The orderBy in the query gets them descending by date originally, 
        // so if urgency is same, they retain their relative order correctly.
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function getConsultById(id: string): Promise<Consult | undefined> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Consult;
    }
    return undefined;
}

export async function addConsult(data: Omit<Consult, "id" | "createdAt">): Promise<Consult> {
    // Generate an ID for the new document natively, or using crypto 
    // We will use crypto.randomUUID() for consistency
    const id = crypto.randomUUID();
    const newConsult: Consult = {
        ...data,
        id,
        createdAt: new Date().toISOString(),
    };
    
    await setDoc(doc(db, COLLECTION_NAME, id), newConsult);
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
