"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorizedStaff, setIsAuthorizedStaff] = useState(false);
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        if (!cancelled) {
          setUser(null);
          setIsAuthorizedStaff(false);
          setLoading(false);
        }
        return;
      }

      void checkIsAuthorizedStaff(currentUser).then((authorized) => {
        if (!cancelled) {
          setUser(currentUser);
          setIsAuthorizedStaff(authorized);
          setLoading(false);
        }
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
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
