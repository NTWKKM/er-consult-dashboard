import { useSyncExternalStore } from "react";

const lockedCaseIds = new Set<string>();
const listenersByCaseId = new Map<string, Set<() => void>>();

function notifyCaseListeners(caseId: string): void {
  const listeners = listenersByCaseId.get(caseId);
  if (!listeners) return;
  for (const listener of listeners) {
    listener();
  }
}

export function isCaseLocked(caseId: string): boolean {
  return lockedCaseIds.has(caseId);
}

export function acquireCaseLock(caseId: string): boolean {
  if (lockedCaseIds.has(caseId)) {
    return false;
  }
  lockedCaseIds.add(caseId);
  notifyCaseListeners(caseId);
  return true;
}

export function releaseCaseLock(caseId: string): void {
  if (!lockedCaseIds.delete(caseId)) {
    return;
  }
  notifyCaseListeners(caseId);
}

export function subscribeCaseLock(caseId: string, listener: () => void): () => void {
  let listeners = listenersByCaseId.get(caseId);
  if (!listeners) {
    listeners = new Set();
    listenersByCaseId.set(caseId, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = listenersByCaseId.get(caseId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersByCaseId.delete(caseId);
    }
  };
}

export function useCaseLocked(caseId: string): boolean {
  return useSyncExternalStore(
    (listener) => subscribeCaseLock(caseId, listener),
    () => isCaseLocked(caseId),
    () => false
  );
}

export function clearAllCaseLocksForTests(): void {
  const activeIds = Array.from(lockedCaseIds);
  lockedCaseIds.clear();
  for (const caseId of activeIds) {
    notifyCaseListeners(caseId);
  }
}
