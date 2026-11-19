"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

async function confirmPendingWritesBeforeLogout(
  firestoreDb: Firestore | null
): Promise<{ canProceed: boolean; confirmedDiscard: boolean }> {
  const confirmDiscard = (message: string) =>
    typeof window !== "undefined" &&
    typeof window.confirm === "function" &&
    window.confirm(message);

  const pendingMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์อาจสูญหาย ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const retainedDraftMessage =
    "มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง หากออกจากระบบข้อมูลร่างจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const combinedMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ และมีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์และข้อมูลร่างจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";

  let writesSettled = true;

  if (firestoreDb) {
    // If already offline with local pending writes, treat writes as unsettled without waiting on network.
    if (typeof navigator !== "undefined" && navigator.onLine === false && hasPendingOptimisticWrites()) {
      writesSettled = false;
    } else {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let syncTimedOut = false;

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
    }
  } else if (hasPendingOptimisticWrites()) {
    writesSettled = false;
  }

  const hasPending = !writesSettled;
  const hasDrafts = hasRetainedSubmitDrafts();

  if (hasPending && hasDrafts) {
    return { canProceed: confirmDiscard(combinedMessage), confirmedDiscard: true };
  }
  if (hasPending) {
    return { canProceed: confirmDiscard(pendingMessage), confirmedDiscard: true };
  }
  if (hasDrafts) {
    return { canProceed: confirmDiscard(retainedDraftMessage), confirmedDiscard: true };
  }

  return { canProceed: true, confirmedDiscard: false };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorizedStaff, setIsAuthorizedStaff] = useState(false);
  const [loading, setLoading] = useState(Boolean(auth));
  const logoutInProgressRef = useRef(false);

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
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;

    try {
      let confirmedDiscard = false;
      if (typeof window !== "undefined") {
        const initialCheck = await confirmPendingWritesBeforeLogout(db);
        if (!initialCheck.canProceed) {
          return;
        }
        confirmedDiscard = initialCheck.confirmedDiscard;

        // Re-check immediately before signOut/cleanup in case a late write started during the async wait
        if (!confirmedDiscard && (hasPendingOptimisticWrites() || hasRetainedSubmitDrafts())) {
          const lateCheck = await confirmPendingWritesBeforeLogout(db);
          if (!lateCheck.canProceed) {
            return;
          }
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
    } finally {
      logoutInProgressRef.current = false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthorizedStaff, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
