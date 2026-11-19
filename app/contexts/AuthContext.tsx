"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { clearIndexedDbPersistence, terminate, waitForPendingWrites, type Firestore } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import {
  clearRetainedSubmitDraft,
  hasPendingOptimisticWrites,
  hasRetainedSubmitDrafts,
} from "../../lib/db";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthorizedStaff: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthorizedStaff: false,
  logout: async () => {},
});

const MNRH_EMAIL_PATTERN = /^[^@]+@mnrh\.com$/i;

async function checkIsAuthorizedStaff(currentUser: User): Promise<boolean> {
  try {
    const tokenResult = await currentUser.getIdTokenResult();
    if (tokenResult.claims?.staff === true) {
      return true;
    }
    const email = typeof currentUser.email === "string" ? currentUser.email : "";
    return Boolean(currentUser.emailVerified && MNRH_EMAIL_PATTERN.test(email));
  } catch {
    // Offline fallback: if getIdTokenResult fails due to transient network drop,
    // allow verified @mnrh.com email so cached ER workflows are not locked out.
    const email = typeof currentUser.email === "string" ? currentUser.email : "";
    return Boolean(currentUser.emailVerified && MNRH_EMAIL_PATTERN.test(email));
  }
}

const PENDING_WRITE_SYNC_TIMEOUT_MS = 1200;

async function confirmPendingWritesBeforeLogout(firestoreDb: Firestore | null): Promise<boolean> {
  const confirmDiscard = (message: string) =>
    typeof window !== "undefined" &&
    typeof window.confirm === "function" &&
    window.confirm(message);

  const pendingMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์อาจสูญหาย ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const retainedDraftMessage =
    "มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง หากออกจากระบบข้อมูลร่างจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";

  if (firestoreDb) {
    // If already offline with local pending writes, ask confirmation immediately rather than waiting on network.
    if (typeof navigator !== "undefined" && navigator.onLine === false && hasPendingOptimisticWrites()) {
      return confirmDiscard(pendingMessage);
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let syncTimedOut = false;
    let writesSettled = false;

    try {
      const syncCompleted = await Promise.race<boolean>([
        waitForPendingWrites(firestoreDb).then(() => true),
        new Promise<boolean>((resolve) => {
          timeoutId = setTimeout(() => {
            syncTimedOut = true;
            resolve(false);
          }, PENDING_WRITE_SYNC_TIMEOUT_MS);
        }),
      ]);

      writesSettled = syncCompleted && !syncTimedOut && !hasPendingOptimisticWrites();
    } catch {
      // Treat waitForPendingWrites failure as unconfirmed pending writes so we never silently wipe local data
      writesSettled = false;
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }

    if (!writesSettled) {
      return confirmDiscard(pendingMessage);
    }
  }

  if (hasRetainedSubmitDrafts()) {
    return confirmDiscard(retainedDraftMessage);
  }

  return true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorizedStaff, setIsAuthorizedStaff] = useState(false);
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;
    let authGeneration = 0;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const generation = ++authGeneration;
      if (!currentUser) {
        if (!cancelled && generation === authGeneration) {
          setUser(null);
          setIsAuthorizedStaff(false);
          setLoading(false);
        }
        return;
      }

      void checkIsAuthorizedStaff(currentUser).then((authorized) => {
        if (!cancelled && generation === authGeneration) {
          setUser(currentUser);
          setIsAuthorizedStaff(authorized);
          setLoading(false);
        }
      });
    });

    return () => {
      cancelled = true;
      authGeneration += 1;
      unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    if (typeof window !== "undefined") {
      const canProceed = await confirmPendingWritesBeforeLogout(db);
      if (!canProceed) {
        return;
      }
    }

    clearRetainedSubmitDraft();

    if (auth) {
      await signOut(auth);
    }
    // Clear local IndexedDB cache on shared ER workstations so patient PHI does not persist across shifts
    if (db && typeof window !== "undefined") {
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch {
        // Ignore if another tab holds an active Firestore connection
      }
      // Full page reload after terminate(db) initializes a clean Firestore instance and redirects via ProtectedRoute
      window.location.reload();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthorizedStaff, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
