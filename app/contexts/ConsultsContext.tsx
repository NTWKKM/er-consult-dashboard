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

function ActiveConsultsSubscription({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  const [cases, setCases] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [uid]);

  return (
    <ConsultsContext.Provider value={{ cases, loading, error }}>
      {children}
    </ConsultsContext.Provider>
  );
}

/**
 * Shared real-time subscription to active ("pending") consults.
 * Keeps a single Firestore listener alive across route transitions (/, /submit, /completed)
 * while keying subscription state by user UID so sign-out or account switch never flashes stale PHI.
 */
export function ConsultsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthorizedStaff } = useAuth();

  if (!user || !isAuthorizedStaff) {
    return (
      <ConsultsContext.Provider value={{ cases: [], loading: false, error: null }}>
        {children}
      </ConsultsContext.Provider>
    );
  }

  return (
    <ActiveConsultsSubscription key={user.uid} uid={user.uid}>
      {children}
    </ActiveConsultsSubscription>
  );
}

export function usePendingConsults() {
  return useContext(ConsultsContext);
}
