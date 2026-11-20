"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { subscribeToConsultsByStatus, type Consult } from "@/lib/db";
import { useAuth } from "./AuthContext";

interface ConsultsContextValue {
  cases: Consult[];
  loading: boolean;
  error: string | null;
}

const ConsultsContext = createContext<ConsultsContextValue>({
  cases: [],
  loading: true,
  error: null,
});

/**
 * Shared real-time subscription to active ("pending") consults.
 * Keeps a single Firestore listener alive across route transitions (/, /submit, /completed)
 * so BottomNav does not open a duplicate listener and /submit -> / renders immediately without a skeleton flash.
 */
export function ConsultsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthorizedStaff } = useAuth();
  const [cases, setCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAuthorizedStaff) {
      return;
    }

    const unsubscribe = subscribeToConsultsByStatus(
      "pending",
      (data) => {
        setCases(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Subscription error:", err);
        setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAuthorizedStaff]);

  const value: ConsultsContextValue =
    user && isAuthorizedStaff
      ? { cases, loading, error }
      : { cases: [], loading: false, error: null };

  return (
    <ConsultsContext.Provider value={value}>
      {children}
    </ConsultsContext.Provider>
  );
}

export function usePendingConsults() {
  return useContext(ConsultsContext);
}
