"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
    ? navigator.onLine
    : true;
}

function getServerSnapshot() {
  return true;
}

function getNullableServerSnapshot(): boolean | null {
  return null;
}

export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns `null` during SSR before hydration confirms navigator.onLine.
 */
export function useConnectionStatus(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => (typeof navigator !== "undefined" ? navigator.onLine : null),
    getNullableServerSnapshot
  );
}
