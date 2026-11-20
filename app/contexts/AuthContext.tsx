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
import {
  releaseLogoutReservation,
  reserveSubmissionsForLogout,
} from "../../lib/logoutReservation";

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
const AUTH_SYNC_CHANNEL = "er_consult_auth_sync_v1";
const PEER_LOGOUT_CHECK_TIMEOUT_MS = 120;
const LOGOUT_RESERVATION_TTL_MS = 5000;
const LOGOUT_RESERVATION_RENEW_INTERVAL_MS = 2000;

interface PeerTabDirtyState {
  hasPending: boolean;
  hasDrafts: boolean;
  hasUnknownPeer: boolean;
}

type AuthSyncMessage =
  | { type: "HELLO"; tabId: string }
  | { type: "HELLO_ACK"; tabId: string }
  | { type: "BYE"; tabId: string }
  | { type: "LOGOUT_CHECK_REQUEST"; requestId: string; senderTabId: string }
  | {
      type: "LOGOUT_CHECK_RESPONSE";
      requestId: string;
      tabId: string;
      hasPending: boolean;
      hasDrafts: boolean;
    }
  | { type: "LOGOUT_RESERVATION_RENEW"; requestIds: string[]; senderTabId: string }
  | { type: "LOGOUT_RESERVATION_RELEASE"; requestId: string; senderTabId: string }
  | { type: "LOGOUT_CLEAR_DRAFTS"; senderTabId: string };

async function confirmPendingWritesBeforeLogout(
  firestoreDb: Firestore | null,
  queryPeerTabs?: () => Promise<PeerTabDirtyState>
): Promise<{ canProceed: boolean; confirmedDiscard: boolean }> {
  const confirmDiscard = (message: string) =>
    typeof window !== "undefined" &&
    typeof window.confirm === "function" &&
    window.confirm(message);

  const pendingMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์อาจสูญหาย ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const retainedDraftMessage =
    "มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง หากออกจากระบบข้อมูลร่างจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const unknownPeerMessage =
    "ยังมีแท็บอื่นที่เปิดค้างอยู่และไม่ตอบสนองต่อการตรวจสอบสถานะข้อมูล (อาจถูกพักการทำงานชั่วคราว) หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์หรือข้อมูลร่างในแท็บนั้นจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const pendingWithUnknownPeerMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ และยังมีแท็บอื่นที่เปิดค้างอยู่และไม่ตอบสนองต่อการตรวจสอบสถานะ (ซึ่งอาจมีข้อมูลเพิ่มเติม) หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์และข้อมูลในแท็บอื่นจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const draftWithUnknownPeerMessage =
    "มีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง และยังมีแท็บอื่นที่เปิดค้างอยู่และไม่ตอบสนองต่อการตรวจสอบสถานะ (ซึ่งอาจมีข้อมูลเพิ่มเติม) หากออกจากระบบตอนนี้ข้อมูลร่างและข้อมูลในแท็บอื่นจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const combinedMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ และมีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง หากออกจากระบบตอนนี้ข้อมูลที่ยังไม่ซิงค์และข้อมูลร่างจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";
  const combinedWithUnknownPeerMessage =
    "ยังมีข้อมูลเคสที่รอการซิงค์ขึ้นระบบ และมีข้อมูลร่างเคสที่ยังส่งไม่สำเร็จเก็บไว้ในเครื่อง รวมถึงยังมีแท็บอื่นที่เปิดค้างอยู่และไม่ตอบสนองต่อการตรวจสอบสถานะ (ซึ่งอาจมีข้อมูลเพิ่มเติม) หากออกจากระบบตอนนี้ข้อมูลทั้งหมดจะถูกลบ ต้องการยืนยันละทิ้งข้อมูลและออกจากระบบหรือไม่?";

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

  const peerState = queryPeerTabs
    ? await queryPeerTabs()
    : { hasPending: false, hasDrafts: false, hasUnknownPeer: false };
  const hasPending = !writesSettled || peerState.hasPending;
  const hasDrafts = hasRetainedSubmitDrafts() || peerState.hasDrafts;

  if (peerState.hasUnknownPeer) {
    if (hasPending && hasDrafts) {
      return { canProceed: confirmDiscard(combinedWithUnknownPeerMessage), confirmedDiscard: true };
    }
    if (hasPending) {
      return { canProceed: confirmDiscard(pendingWithUnknownPeerMessage), confirmedDiscard: true };
    }
    if (hasDrafts) {
      return { canProceed: confirmDiscard(draftWithUnknownPeerMessage), confirmedDiscard: true };
    }
    return { canProceed: confirmDiscard(unknownPeerMessage), confirmedDiscard: true };
  }

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
  const logoutSequenceRef = useRef(0);
  const tabIdRef = useRef<string>("");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peerTabsRef = useRef<Set<string>>(new Set());
  const peerReservationsRef = useRef<Map<string, string>>(new Map());
  const pendingPeerChecksRef = useRef<
    Map<string, (response: { tabId: string; hasPending: boolean; hasDrafts: boolean }) => void>
  >(new Map());

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }

    if (!tabIdRef.current) {
      tabIdRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channelRef.current = channel;
    const myTabId = tabIdRef.current;

    channel.onmessage = (event: MessageEvent<AuthSyncMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case "HELLO":
          if (msg.tabId !== myTabId) {
            peerTabsRef.current.add(msg.tabId);
            channel.postMessage({ type: "HELLO_ACK", tabId: myTabId } satisfies AuthSyncMessage);
          }
          break;
        case "HELLO_ACK":
          if (msg.tabId !== myTabId) {
            peerTabsRef.current.add(msg.tabId);
          }
          break;
        case "BYE":
          peerTabsRef.current.delete(msg.tabId);
          for (const [requestId, ownerTabId] of peerReservationsRef.current.entries()) {
            if (ownerTabId === msg.tabId) {
              releaseLogoutReservation(requestId);
              peerReservationsRef.current.delete(requestId);
            }
          }
          break;
        case "LOGOUT_CHECK_REQUEST":
          if (msg.senderTabId !== myTabId) {
            // Reserve peer submissions before reading dirty state so no new submit starts mid-logout check
            reserveSubmissionsForLogout(msg.requestId, LOGOUT_RESERVATION_TTL_MS);
            peerReservationsRef.current.set(msg.requestId, msg.senderTabId);
            channel.postMessage({
              type: "LOGOUT_CHECK_RESPONSE",
              requestId: msg.requestId,
              tabId: myTabId,
              hasPending: hasPendingOptimisticWrites(),
              hasDrafts: hasRetainedSubmitDrafts(),
            } satisfies AuthSyncMessage);
          }
          break;
        case "LOGOUT_CHECK_RESPONSE": {
          const handler = pendingPeerChecksRef.current.get(msg.requestId);
          if (handler) {
            handler({ tabId: msg.tabId, hasPending: msg.hasPending, hasDrafts: msg.hasDrafts });
          }
          break;
        }
        case "LOGOUT_RESERVATION_RENEW":
          if (msg.senderTabId !== myTabId) {
            for (const requestId of msg.requestIds) {
              if (peerReservationsRef.current.get(requestId) === msg.senderTabId) {
                reserveSubmissionsForLogout(requestId, LOGOUT_RESERVATION_TTL_MS);
              }
            }
          }
          break;
        case "LOGOUT_RESERVATION_RELEASE":
          if (msg.senderTabId !== myTabId) {
            releaseLogoutReservation(msg.requestId);
            peerReservationsRef.current.delete(msg.requestId);
          }
          break;
        case "LOGOUT_CLEAR_DRAFTS":
          if (msg.senderTabId !== myTabId) {
            clearRetainedSubmitDraft();
          }
          break;
      }
    };

    const announceHello = () => {
      try {
        channel.postMessage({ type: "HELLO", tabId: myTabId } satisfies AuthSyncMessage);
      } catch {
        // Ignore if channel is already closed
      }
    };
    announceHello();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        announceHello();
      }
    };
    const notifyBye = () => {
      try {
        channel.postMessage({ type: "BYE", tabId: myTabId } satisfies AuthSyncMessage);
      } catch {
        // Ignore if channel is already closed
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", notifyBye);

    const peerTabs = peerTabsRef.current;
    const peerReservations = peerReservationsRef.current;
    const pendingPeerChecks = pendingPeerChecksRef.current;
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", notifyBye);
      notifyBye();
      channelRef.current = null;
      peerTabs.clear();
      for (const reservationId of peerReservations.keys()) {
        releaseLogoutReservation(reservationId);
      }
      peerReservations.clear();
      pendingPeerChecks.clear();
      channel.close();
    };
  }, []);

  const queryPeerTabsBeforeLogout = useCallback(async (issuedRequestIds?: string[]): Promise<PeerTabDirtyState> => {
    const channel = channelRef.current;
    const peers = peerTabsRef.current;
    if (!channel || peers.size === 0) {
      return { hasPending: false, hasDrafts: false, hasUnknownPeer: false };
    }

    const expectedPeers = new Set(peers);
    const responded = new Set<string>();
    let peerPending = false;
    let peerDrafts = false;
    let hasUnknownPeer = false;
    const requestId = `${tabIdRef.current}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    issuedRequestIds?.push(requestId);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        pendingPeerChecksRef.current.delete(requestId);
        // Treat any registered peer tab that did not respond before timeout as unknown rather than clean
        for (const peerId of expectedPeers) {
          if (!responded.has(peerId)) {
            hasUnknownPeer = true;
            break;
          }
        }
        resolve();
      };

      const timeoutId = setTimeout(finish, PEER_LOGOUT_CHECK_TIMEOUT_MS);

      pendingPeerChecksRef.current.set(requestId, ({ tabId, hasPending, hasDrafts }) => {
        if (expectedPeers.has(tabId)) {
          responded.add(tabId);
        }
        if (hasPending) peerPending = true;
        if (hasDrafts) peerDrafts = true;
        if ((peerPending && peerDrafts) || responded.size >= expectedPeers.size) {
          finish();
        }
      });

      channel.postMessage({
        type: "LOGOUT_CHECK_REQUEST",
        requestId,
        senderTabId: tabIdRef.current,
      } satisfies AuthSyncMessage);
    });

    return { hasPending: peerPending, hasDrafts: peerDrafts, hasUnknownPeer };
  }, []);

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;
    let authGeneration = 0;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const generation = ++authGeneration;
      if (!currentUser) {
        // Invalidate retained PHI drafts in every tab as soon as Firebase reports signed-out state
        clearRetainedSubmitDraft();
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
    const selfReservationId = `self-logout-${++logoutSequenceRef.current}`;
    reserveSubmissionsForLogout(selfReservationId, LOGOUT_RESERVATION_TTL_MS);
    const issuedRequestIds: string[] = [];
    let logoutCommitted = false;
    // Periodically renew the short-lived lease while confirmation or signOut is in flight
    const renewIntervalId =
      typeof window !== "undefined"
        ? setInterval(() => {
            reserveSubmissionsForLogout(selfReservationId, LOGOUT_RESERVATION_TTL_MS);
            if (issuedRequestIds.length > 0) {
              try {
                channelRef.current?.postMessage({
                  type: "LOGOUT_RESERVATION_RENEW",
                  requestIds: [...issuedRequestIds],
                  senderTabId: tabIdRef.current,
                } satisfies AuthSyncMessage);
              } catch {
                // Ignore broadcast errors during slow logout
              }
            }
          }, LOGOUT_RESERVATION_RENEW_INTERVAL_MS)
        : null;

    try {
      let confirmedDiscard = false;
      if (typeof window !== "undefined") {
        const initialCheck = await confirmPendingWritesBeforeLogout(db, () =>
          queryPeerTabsBeforeLogout(issuedRequestIds)
        );
        if (!initialCheck.canProceed) {
          return;
        }
        confirmedDiscard = initialCheck.confirmedDiscard;

        // Re-check immediately before signOut/cleanup in case a late write or peer draft appeared during wait
        if (!confirmedDiscard) {
          const latePeerState = await queryPeerTabsBeforeLogout(issuedRequestIds);
          if (
            hasPendingOptimisticWrites() ||
            hasRetainedSubmitDrafts() ||
            latePeerState.hasPending ||
            latePeerState.hasDrafts ||
            latePeerState.hasUnknownPeer
          ) {
            const lateCheck = await confirmPendingWritesBeforeLogout(db, () =>
              queryPeerTabsBeforeLogout(issuedRequestIds)
            );
            if (!lateCheck.canProceed) {
              return;
            }
          }
        }
      }

      if (auth) {
        await signOut(auth);
      }
      logoutCommitted = true;

      clearRetainedSubmitDraft();
      try {
        channelRef.current?.postMessage({
          type: "LOGOUT_CLEAR_DRAFTS",
          senderTabId: tabIdRef.current,
        } satisfies AuthSyncMessage);
      } catch {
        // Ignore broadcast errors during logout
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
      if (renewIntervalId !== null) {
        clearInterval(renewIntervalId);
      }
      if (!logoutCommitted) {
        releaseLogoutReservation(selfReservationId);
        for (const requestId of issuedRequestIds) {
          try {
            channelRef.current?.postMessage({
              type: "LOGOUT_RESERVATION_RELEASE",
              requestId,
              senderTabId: tabIdRef.current,
            } satisfies AuthSyncMessage);
          } catch {
            // Ignore broadcast errors during cleanup
          }
        }
      }
      logoutInProgressRef.current = false;
    }
  }, [queryPeerTabsBeforeLogout]);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthorizedStaff, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
