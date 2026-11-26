"use client";

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { clearIndexedDbPersistence, terminate, waitForPendingWrites, type Firestore } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import {
  clearRetainedSubmitDraft,
  hasPendingOptimisticWrites,
  hasRetainedSubmitDrafts,
} from "../../lib/db";
import {
  type LogoutReservationStore,
  releaseLogoutReservation,
  reserveSubmissionsForLogout,
} from "../../lib/logoutReservation";
import ConfirmModal from "../components/ConfirmModal";

type LogoutReservationActions = Pick<
  LogoutReservationStore,
  "reserveSubmissionsForLogout" | "releaseLogoutReservation"
>;

const DEFAULT_LOGOUT_RESERVATION_STORE: LogoutReservationActions = {
  reserveSubmissionsForLogout,
  releaseLogoutReservation,
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthorizedStaff: boolean;
  isPendingCleanup: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthorizedStaff: false,
  isPendingCleanup: false,
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
const PEER_TERMINATE_TIMEOUT_MS = 500;
const PEER_CACHE_CLEAR_FALLBACK_MS = 1500;
const PEER_CACHE_CLEAR_PENDING_WAIT_MS = 3000;
const STARTUP_IDB_PROBE_TIMEOUT_MS = PEER_CACHE_CLEAR_PENDING_WAIT_MS;
const LOGOUT_RESERVATION_TTL_MS = 5000;
const LOGOUT_RESERVATION_RENEW_INTERVAL_MS = 2000;
const PENDING_CLEANUP_STORAGE_KEY = "er_consult_pending_cache_cleanup_v1";
const PENDING_CLEANUP_COOKIE_NAME = "er_consult_pending_cache_cleanup_v1";
const WINDOW_NAME_CLEANUP_PREFIX = "__er_consult_pending_cleanup__:";
const DECLINED_HOLD_MARKER_VALUE = "__declined_hold__";

interface PendingCleanupMarker {
  requestId: string | null;
  storageError?: boolean;
  declinedHold?: boolean;
}

function parseCleanupMarkerValue(raw: string): PendingCleanupMarker {
  if (!raw || raw === "1") return { requestId: null };
  if (raw === DECLINED_HOLD_MARKER_VALUE) {
    return { requestId: null, declinedHold: true };
  }
  return { requestId: raw };
}

function readWindowNameCleanupMarker(): { marker: PendingCleanupMarker | null; error?: boolean } {
  if (typeof window === "undefined") return { marker: null };
  try {
    const name = window.name;
    if (typeof name !== "string" || !name.startsWith(WINDOW_NAME_CLEANUP_PREFIX)) {
      return { marker: null };
    }
    const raw = name.slice(WINDOW_NAME_CLEANUP_PREFIX.length);
    return { marker: parseCleanupMarkerValue(raw) };
  } catch {
    return { marker: null, error: true };
  }
}

function writeWindowNameCleanupMarker(requestId: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.name = `${WINDOW_NAME_CLEANUP_PREFIX}${requestId || "1"}`;
    return typeof window.name === "string" && window.name.startsWith(WINDOW_NAME_CLEANUP_PREFIX);
  } catch {
    return false;
  }
}

function clearWindowNameCleanupMarker() {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.name === "string" && window.name.startsWith(WINDOW_NAME_CLEANUP_PREFIX)) {
      window.name = "";
    }
  } catch {
    // Ignore restricted window.name errors
  }
}

function readCookieCleanupMarker(): PendingCleanupMarker | null {
  if (typeof document === "undefined") return null;
  try {
    const cookieStr = document.cookie;
    if (typeof cookieStr !== "string" || !cookieStr) return null;
    const prefix = `${PENDING_CLEANUP_COOKIE_NAME}=`;
    for (const part of cookieStr.split(";")) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        const raw = trimmed.slice(prefix.length);
        if (!raw) return null;
        try {
          const decoded = decodeURIComponent(raw);
          return parseCleanupMarkerValue(decoded);
        } catch {
          return { requestId: null };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeCookieCleanupMarker(requestId: string | null): boolean {
  if (typeof document === "undefined") return false;
  try {
    const value = encodeURIComponent(requestId || "1");
    document.cookie = `${PENDING_CLEANUP_COOKIE_NAME}=${value}; path=/; SameSite=Lax`;
    return readCookieCleanupMarker() !== null;
  } catch {
    return false;
  }
}

function clearCookieCleanupMarker() {
  if (typeof document === "undefined") return;
  try {
    if (readCookieCleanupMarker() !== null) {
      document.cookie = `${PENDING_CLEANUP_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    // Ignore restricted cookie errors
  }
}

function getTargetFirestoreIndexedDbName(targetDb: Firestore): string | null {
  const candidate = targetDb as unknown as {
    toJSON?: () => {
      app?: { options?: { projectId?: unknown } };
      databaseId?: { projectId?: unknown; database?: unknown; isDefaultDatabase?: unknown };
    };
    app?: { options?: { projectId?: unknown } };
    _databaseId?: { projectId?: unknown; database?: unknown; isDefaultDatabase?: unknown };
    _persistenceKey?: unknown;
  };
  const json = typeof candidate.toJSON === "function" ? candidate.toJSON() : undefined;
  const dbId = candidate._databaseId ?? json?.databaseId;
  const projectId =
    (typeof dbId?.projectId === "string" && dbId.projectId) ||
    (typeof candidate.app?.options?.projectId === "string" && candidate.app.options.projectId) ||
    (typeof json?.app?.options?.projectId === "string" && json.app.options.projectId) ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  if (!projectId) return null;

  const database =
    typeof dbId?.database === "string" && dbId.database ? dbId.database : "(default)";
  const isDefaultDatabase =
    typeof dbId?.isDefaultDatabase === "boolean"
      ? dbId.isDefaultDatabase
      : database === "(default)";
  const persistenceKey =
    typeof candidate._persistenceKey === "string" && candidate._persistenceKey
      ? candidate._persistenceKey
      : "[DEFAULT]";
  const dbSegment = isDefaultDatabase ? projectId : `${projectId}.${database}`;
  return `firestore/${persistenceKey}/${dbSegment}/main`;
}

async function checkStartupFirestoreIndexedDb(
  targetDb: Firestore,
  options?: {
    onPending?: () => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<"found" | "clean" | "error"> {
  if (typeof window === "undefined") return "clean";
  const targetDbName = getTargetFirestoreIndexedDbName(targetDb);
  if (!targetDbName) return "clean";
  const idb = window.indexedDB;
  if (!idb) return "clean";
  if (typeof idb.databases === "function") {
    try {
      const databases = await idb.databases();
      return databases.some((entry) => entry?.name === targetDbName) ? "found" : "clean";
    } catch {
      return "error";
    }
  }
  if (typeof idb.open === "function") {
    // Fallback for browsers without indexedDB.databases(): probe targetDbName without mutating state
    return new Promise<"found" | "clean" | "error">((resolve) => {
      let createdNewDb = false;
      let settled = false;
      let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
      const clearWatchdog = () => {
        if (watchdogTimer !== null) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
      };
      const handleAbort = () => {
        clearWatchdog();
      };
      options?.signal?.addEventListener("abort", handleAbort, { once: true });
      const finish = (status: "found" | "clean" | "error") => {
        if (settled) return;
        settled = true;
        clearWatchdog();
        options?.signal?.removeEventListener("abort", handleAbort);
        resolve(status);
      };
      const timeoutMs = options?.timeoutMs ?? STARTUP_IDB_PROBE_TIMEOUT_MS;
      if (!options?.signal?.aborted) {
        watchdogTimer = setTimeout(() => {
          watchdogTimer = null;
          if (settled || options?.signal?.aborted) return;
          if (options?.onPending) {
            options.onPending();
          } else {
            finish("error");
          }
        }, timeoutMs);
      }
      try {
        const req = idb.open(targetDbName);
        req.onupgradeneeded = () => {
          createdNewDb = true;
          try {
            // Abort the versionchange transaction so IndexedDB rolls back creation atomically
            // without a post-close deleteDatabase race against another context.
            req.transaction?.abort();
          } catch {
            // Ignore abort errors on empty DB probe
          }
        };
        req.onsuccess = () => {
          try {
            req.result?.close();
          } catch {
            // Ignore close errors
          }
          if (settled) return;
          if (createdNewDb) {
            finish("clean");
          } else {
            finish("found");
          }
        };
        req.onerror = () => {
          if (settled) return;
          if (createdNewDb) {
            finish("clean");
          } else {
            finish("error");
          }
        };
        req.onblocked = () => {
          if (settled) return;
          finish("error");
        };
      } catch {
        finish("error");
      }
    });
  }
  return "error";
}

function readPendingCleanupMarker(): PendingCleanupMarker | null {
  if (typeof window === "undefined") return null;
  let readError = false;
  let sessionMarker: PendingCleanupMarker | null = null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CLEANUP_STORAGE_KEY);
    if (raw) {
      sessionMarker = parseCleanupMarkerValue(raw);
    }
  } catch {
    readError = true;
  }
  const win = readWindowNameCleanupMarker();
  if (win.error) {
    readError = true;
  }
  const cookieMarker = readCookieCleanupMarker();

  const markers = [sessionMarker, win.marker, cookieMarker].filter(
    (marker): marker is PendingCleanupMarker => marker !== null
  );
  if (markers.length === 0) {
    // Fail closed if sessionStorage or window.name cannot be read so sign-in cannot bypass an unverified cleanup
    return readError ? { requestId: null, storageError: true } : null;
  }

  const hasDeclinedHold = markers.some((marker) => Boolean(marker.declinedHold));
  const ordinaryMarker = markers.find((marker) => !marker.declinedHold) ?? null;

  if (hasDeclinedHold && ordinaryMarker) {
    // Ordinary cleanup marker conflicts with a declined hold whose write order is unknown:
    // keep sign-in blocked, protect queued writes/drafts, and require explicit consent before clearing.
    return {
      requestId: null,
      declinedHold: true,
      ...(readError ? { storageError: true } : {}),
    };
  }

  if (hasDeclinedHold) {
    return {
      requestId: null,
      declinedHold: true,
      ...(readError ? { storageError: true } : {}),
    };
  }

  return readError ? { ...ordinaryMarker!, storageError: true } : ordinaryMarker!;
}

function canReadPendingCleanupStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CLEANUP_STORAGE_KEY);
    const win = readWindowNameCleanupMarker();
    return raw === null && !win.error && win.marker === null && readCookieCleanupMarker() === null;
  } catch {
    return false;
  }
}

function writePendingCleanupMarker(requestId: string | null): boolean {
  if (typeof window === "undefined") return false;
  const value = requestId || "1";
  try {
    window.sessionStorage.setItem(PENDING_CLEANUP_STORAGE_KEY, value);
    clearWindowNameCleanupMarker();
    return true;
  } catch {
    // Fall back to tab-scoped window.name, then same-origin cookie when sessionStorage.setItem fails
    if (writeWindowNameCleanupMarker(requestId)) {
      return true;
    }
    return writeCookieCleanupMarker(requestId);
  }
}

function clearPendingCleanupMarker() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_CLEANUP_STORAGE_KEY);
  } catch {
    // Ignore restricted storage errors
  }
  clearWindowNameCleanupMarker();
  clearCookieCleanupMarker();
}

interface PeerTabDirtyState {
  hasPending: boolean;
  hasDrafts: boolean;
  hasUnknownPeer: boolean;
}

type AuthSyncMessage =
  | { type: "HELLO"; tabId: string; hasPending?: boolean; hasDrafts?: boolean }
  | {
      type: "HELLO_ACK";
      tabId: string;
      activeLogoutReservationId?: string;
      awaitConsentBeforeClear?: boolean;
      hasPending?: boolean;
      hasDrafts?: boolean;
    }
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
  | { type: "LOGOUT_DECLINED_PRESERVE_DRAFTS"; senderTabId: string }
  | { type: "LOGOUT_CLEAR_DRAFTS"; senderTabId: string }
  | { type: "LOGOUT_TERMINATE_DB_REQUEST"; requestId: string; senderTabId: string }
  | { type: "LOGOUT_TERMINATE_DB_ACK"; requestId: string; tabId: string }
  | { type: "LOGOUT_CACHE_CLEARED"; requestId: string; senderTabId: string };

async function confirmPendingWritesBeforeLogout(
  firestoreDb: Firestore | null,
  requestDiscardConfirmation: (message: string) => Promise<boolean>,
  queryPeerTabs?: () => Promise<PeerTabDirtyState>
): Promise<{ canProceed: boolean; confirmedDiscard: boolean }> {

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
      return { canProceed: await requestDiscardConfirmation(combinedWithUnknownPeerMessage), confirmedDiscard: true };
    }
    if (hasPending) {
      return { canProceed: await requestDiscardConfirmation(pendingWithUnknownPeerMessage), confirmedDiscard: true };
    }
    if (hasDrafts) {
      return { canProceed: await requestDiscardConfirmation(draftWithUnknownPeerMessage), confirmedDiscard: true };
    }
    return { canProceed: await requestDiscardConfirmation(unknownPeerMessage), confirmedDiscard: true };
  }

  if (hasPending && hasDrafts) {
    return { canProceed: await requestDiscardConfirmation(combinedMessage), confirmedDiscard: true };
  }
  if (hasPending) {
    return { canProceed: await requestDiscardConfirmation(pendingMessage), confirmedDiscard: true };
  }
  if (hasDrafts) {
    return { canProceed: await requestDiscardConfirmation(retainedDraftMessage), confirmedDiscard: true };
  }

  return { canProceed: true, confirmedDiscard: false };
}

export function AuthProvider({
  children,
  reservationStore,
}: {
  children: React.ReactNode;
  reservationStore?: LogoutReservationActions;
}) {
  const activeReservationStore = reservationStore ?? DEFAULT_LOGOUT_RESERVATION_STORE;
  const activeReservationStoreRef = useRef(activeReservationStore);
  useEffect(() => {
    activeReservationStoreRef.current = activeReservationStore;
  }, [activeReservationStore]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorizedStaff, setIsAuthorizedStaff] = useState(false);
  const [loading, setLoading] = useState(Boolean(auth));
  const signedOutAppliedRef = useRef(!auth);
  const logoutInProgressRef = useRef(false);
  const logoutSequenceRef = useRef(0);
  const activeLogoutReservationIdRef = useRef<string | null>(null);
  const logoutConsentedRef = useRef(false);
  const holdClearOnConsentTabRef = useRef<string | null>(null);
  const [initialPersistedCleanup] = useState(() => readPendingCleanupMarker());
  const preserveDraftOnSignOutDeclineRef = useRef(Boolean(initialPersistedCleanup?.declinedHold));
  const helloHandshakeStateRef = useRef<"settled" | "pending" | "unknown">("settled");
  const handshakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerDbTerminatedRef = useRef(false);
  const peerTerminateSucceededRef = useRef(false);
  const peerCacheClearedRef = useRef(false);
  const pendingFirestoreCleanupRef = useRef(Boolean(initialPersistedCleanup));
  const activeTerminateRequestIdRef = useRef<string | null>(null);
  const terminatedDbRef = useRef<Firestore | null>(
    initialPersistedCleanup && !initialPersistedCleanup.declinedHold ? db : null
  );
  const activeClearPromiseRef = useRef<Promise<void> | null>(null);
  const cleanupRoleRef = useRef<"peer" | "initiator" | null>(
    initialPersistedCleanup && !initialPersistedCleanup.declinedHold ? "initiator" : null
  );
  const initiatorTerminateSucceededRef = useRef(false);
  const initiatorTerminateRequestIdRef = useRef<string | null>(
    initialPersistedCleanup?.requestId ?? null
  );
  const initiatorFinalizingRef = useRef(false);
  const persistedCleanupRanRef = useRef(false);
  const startupCacheCheckStartedRef = useRef(false);
  const startupCacheCheckInFlightRef = useRef(false);
  const startupCleanupStartedRef = useRef(false);
  const deferredAuthUserRef = useRef<{ user: User; generation: number } | null>(null);
  const postSignOutDeclinedRef = useRef(Boolean(initialPersistedCleanup?.declinedHold));
  const verifyIdbCleanOnFinalizeRef = useRef(false);
  const peerReloadFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerClearPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initiatorClearPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupBackdropRef = useRef<HTMLDivElement>(null);
  const cleanupDialogRef = useRef<HTMLDivElement>(null);
  const cleanupRetryButtonRef = useRef<HTMLButtonElement>(null);
  const [cleanupPhase, setCleanupPhase] = useState<
    "idle" | "pending" | "manual_retry" | "declined_hold"
  >(
    initialPersistedCleanup
      ? initialPersistedCleanup.declinedHold
        ? "declined_hold"
        : "pending"
      : "idle"
  );
  const [cleanupBlockedByPending, setCleanupBlockedByPending] = useState(false);
  const [cleanupNeedsConnectionReset, setCleanupNeedsConnectionReset] = useState(false);
  const [manualRetryInFlight, setManualRetryInFlight] = useState(false);
  const [manualRetryError, setManualRetryError] = useState(false);
  const [startupCacheChecking, setStartupCacheChecking] = useState(false);
  const [logoutCleanupGateActive, setLogoutCleanupGateActive] = useState(false);
  const getOrStartClearPersistence = useCallback((targetDb: Firestore): Promise<void> => {
    if (!activeClearPromiseRef.current) {
      const clearPromise = clearIndexedDbPersistence(targetDb).finally(() => {
        if (activeClearPromiseRef.current === clearPromise) {
          activeClearPromiseRef.current = null;
        }
      });
      activeClearPromiseRef.current = clearPromise;
    }
    return activeClearPromiseRef.current;
  }, []);
  const triggerPeerReloadIfReady = useCallback(() => {
    if (
      (signedOutAppliedRef.current || pendingFirestoreCleanupRef.current) &&
      peerDbTerminatedRef.current &&
      peerCacheClearedRef.current &&
      typeof window !== "undefined"
    ) {
      if (peerReloadFallbackTimerRef.current !== null) {
        clearTimeout(peerReloadFallbackTimerRef.current);
        peerReloadFallbackTimerRef.current = null;
      }
      if (peerClearPendingTimerRef.current !== null) {
        clearTimeout(peerClearPendingTimerRef.current);
        peerClearPendingTimerRef.current = null;
      }
      if (initiatorClearPendingTimerRef.current !== null) {
        clearTimeout(initiatorClearPendingTimerRef.current);
        initiatorClearPendingTimerRef.current = null;
      }
      clearPendingCleanupMarker();
      pendingFirestoreCleanupRef.current = false;
      peerDbTerminatedRef.current = false;
      peerTerminateSucceededRef.current = false;
      peerCacheClearedRef.current = false;
      activeTerminateRequestIdRef.current = null;
      terminatedDbRef.current = null;
      cleanupRoleRef.current = null;
      initiatorTerminateSucceededRef.current = false;
      initiatorTerminateRequestIdRef.current = null;
      setCleanupPhase("idle");
      setCleanupBlockedByPending(false);
      setCleanupNeedsConnectionReset(false);
      setManualRetryInFlight(false);
      setManualRetryError(false);
      window.location.reload();
    }
  }, []);
  const [logoutDiscardPrompt, setLogoutDiscardPrompt] = useState<{
    message: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const logoutDiscardPromptRef = useRef<{
    message: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const joinedDirtyDuringLogoutRef = useRef<{ hasPending: boolean; hasDrafts: boolean }>({
    hasPending: false,
    hasDrafts: false,
  });
  const tabIdRef = useRef<string>("");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peerTabsRef = useRef<Set<string>>(new Set());
  const peerReservationsRef = useRef<Map<string, string>>(new Map());
  const pendingSignedOutReservationsRef = useRef<Set<string>>(new Set());
  const pendingPeerChecksRef = useRef<
    Map<string, (response: { tabId: string; hasPending: boolean; hasDrafts: boolean }) => void>
  >(new Map());
  const pendingTerminateAcksRef = useRef<Map<string, (tabId: string) => void>>(new Map());

  const requestDiscardConfirmation = useCallback((message: string): Promise<boolean> => {
    if (typeof window === "undefined") {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const prompt = { message, resolve };
      logoutDiscardPromptRef.current = prompt;
      setLogoutDiscardPrompt(prompt);
    });
  }, []);

  const settleDiscardPrompt = useCallback((confirmed: boolean) => {
    const activePrompt = logoutDiscardPromptRef.current;
    logoutDiscardPromptRef.current = null;
    setLogoutDiscardPrompt(null);
    activePrompt?.resolve(confirmed);
  }, []);

  const waitForHelloHandshake = useCallback(async () => {
    if (
      typeof BroadcastChannel === "undefined" ||
      helloHandshakeStateRef.current !== "pending"
    ) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, PEER_LOGOUT_CHECK_TIMEOUT_MS);
    });
  }, []);

  const enterPostSignOutDeclinedHold = useCallback(() => {
    preserveDraftOnSignOutDeclineRef.current = true;
    postSignOutDeclinedRef.current = true;
    pendingFirestoreCleanupRef.current = true;
    const markerPersisted = writePendingCleanupMarker(DECLINED_HOLD_MARKER_VALUE);
    setManualRetryError(!markerPersisted);
    setLogoutCleanupGateActive(false);
    setCleanupPhase("declined_hold");
    try {
      channelRef.current?.postMessage({
        type: "LOGOUT_DECLINED_PRESERVE_DRAFTS",
        senderTabId: tabIdRef.current,
      } satisfies AuthSyncMessage);
    } catch {
      // Ignore broadcast errors during decline
    }
  }, []);

  useEffect(() => {
    return () => {
      if (logoutDiscardPromptRef.current) {
        const pending = logoutDiscardPromptRef.current;
        logoutDiscardPromptRef.current = null;
        pending.resolve(false);
      }
    };
  }, []);

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
            if (logoutInProgressRef.current) {
              if (msg.hasPending) joinedDirtyDuringLogoutRef.current.hasPending = true;
              if (msg.hasDrafts) joinedDirtyDuringLogoutRef.current.hasDrafts = true;
            }
            channel.postMessage({
              type: "HELLO_ACK",
              tabId: myTabId,
              hasPending: hasPendingOptimisticWrites(),
              hasDrafts: hasRetainedSubmitDrafts(),
              ...(activeLogoutReservationIdRef.current
                ? {
                    activeLogoutReservationId: activeLogoutReservationIdRef.current,
                    awaitConsentBeforeClear: !logoutConsentedRef.current,
                  }
                : {}),
            } satisfies AuthSyncMessage);
          }
          break;
        case "HELLO_ACK":
          if (msg.tabId !== myTabId) {
            peerTabsRef.current.add(msg.tabId);
            if (logoutInProgressRef.current) {
              if (msg.hasPending) joinedDirtyDuringLogoutRef.current.hasPending = true;
              if (msg.hasDrafts) joinedDirtyDuringLogoutRef.current.hasDrafts = true;
            }
            if (msg.awaitConsentBeforeClear) {
              holdClearOnConsentTabRef.current = msg.tabId;
            }
            if (msg.activeLogoutReservationId) {
              // Newly opened or bfcache-restored tabs must respect an in-flight logout reservation
              activeReservationStore.reserveSubmissionsForLogout(
                msg.activeLogoutReservationId,
                LOGOUT_RESERVATION_TTL_MS
              );
              peerReservationsRef.current.set(msg.activeLogoutReservationId, msg.tabId);
            }
          }
          break;
        case "BYE":
          peerTabsRef.current.delete(msg.tabId);
          if (holdClearOnConsentTabRef.current === msg.tabId) {
            holdClearOnConsentTabRef.current = null;
          }
          for (const [requestId, ownerTabId] of peerReservationsRef.current.entries()) {
            if (ownerTabId === msg.tabId) {
              activeReservationStore.releaseLogoutReservation(requestId);
              peerReservationsRef.current.delete(requestId);
            }
          }
          break;
        case "LOGOUT_CHECK_REQUEST":
          if (msg.senderTabId !== myTabId) {
            // Reserve peer submissions before reading dirty state so no new submit starts mid-logout check
            activeReservationStore.reserveSubmissionsForLogout(
              msg.requestId,
              LOGOUT_RESERVATION_TTL_MS
            );
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
                activeReservationStore.reserveSubmissionsForLogout(
                  requestId,
                  LOGOUT_RESERVATION_TTL_MS
                );
              }
            }
          }
          break;
        case "LOGOUT_RESERVATION_RELEASE":
          if (msg.senderTabId !== myTabId) {
            activeReservationStore.releaseLogoutReservation(msg.requestId);
            peerReservationsRef.current.delete(msg.requestId);
          }
          break;
        case "LOGOUT_DECLINED_PRESERVE_DRAFTS":
          if (msg.senderTabId !== myTabId) {
            preserveDraftOnSignOutDeclineRef.current = true;
            if (holdClearOnConsentTabRef.current === msg.senderTabId) {
              holdClearOnConsentTabRef.current = null;
            }
          }
          break;
        case "LOGOUT_CLEAR_DRAFTS":
          if (msg.senderTabId !== myTabId) {
            preserveDraftOnSignOutDeclineRef.current = false;
            helloHandshakeStateRef.current = "settled";
            holdClearOnConsentTabRef.current = null;
            clearRetainedSubmitDraft();
            for (const [requestId, ownerTabId] of peerReservationsRef.current.entries()) {
              if (ownerTabId === msg.senderTabId) {
                if (signedOutAppliedRef.current) {
                  activeReservationStore.releaseLogoutReservation(requestId);
                } else {
                  // Hold without TTL until this tab applies its signed-out state (or unmounts)
                  activeReservationStore.reserveSubmissionsForLogout(requestId, Infinity);
                  pendingSignedOutReservationsRef.current.add(requestId);
                }
                peerReservationsRef.current.delete(requestId);
              }
            }
          }
          break;
        case "LOGOUT_TERMINATE_DB_REQUEST":
          if (msg.senderTabId !== myTabId) {
            const requestId = msg.requestId;
            // Reset peer reload-barrier state for each termination request so earlier signals cannot carry over
            activeTerminateRequestIdRef.current = requestId;
            cleanupRoleRef.current = "peer";
            peerDbTerminatedRef.current = false;
            peerTerminateSucceededRef.current = false;
            peerCacheClearedRef.current = false;
            setCleanupBlockedByPending(false);
            setCleanupNeedsConnectionReset(false);
            if (peerReloadFallbackTimerRef.current !== null) {
              clearTimeout(peerReloadFallbackTimerRef.current);
              peerReloadFallbackTimerRef.current = null;
            }
            if (peerClearPendingTimerRef.current !== null) {
              clearTimeout(peerClearPendingTimerRef.current);
              peerClearPendingTimerRef.current = null;
            }
            const isCurrentRequest = () =>
              channelRef.current === channel && activeTerminateRequestIdRef.current === requestId;
            const sendAck = () => {
              try {
                channel.postMessage({
                  type: "LOGOUT_TERMINATE_DB_ACK",
                  requestId,
                  tabId: myTabId,
                } satisfies AuthSyncMessage);
              } catch {
                // Ignore closed channel during teardown
              }
            };
            if (db) {
              const activeDb = db;
              const markerPersisted = writePendingCleanupMarker(requestId);
              pendingFirestoreCleanupRef.current = true;
              terminatedDbRef.current = activeDb;
              setCleanupPhase("pending");
              setManualRetryError(!markerPersisted);
              setUser(null);
              setIsAuthorizedStaff(false);
              void terminate(activeDb)
                .then(
                  () => {
                    if (isCurrentRequest()) {
                      peerTerminateSucceededRef.current = true;
                    }
                  },
                  () => {
                    if (isCurrentRequest()) {
                      peerTerminateSucceededRef.current = false;
                    }
                  }
                )
                .finally(() => {
                  sendAck();
                  if (!isCurrentRequest()) return;
                  peerDbTerminatedRef.current = true;
                  if (peerCacheClearedRef.current) {
                    triggerPeerReloadIfReady();
                  } else if (!peerTerminateSucceededRef.current) {
                    // Never clear IndexedDB on a peer whose terminate() rejected; require a marker-verified reload
                    pendingFirestoreCleanupRef.current = true;
                    terminatedDbRef.current = activeDb;
                    setCleanupBlockedByPending(false);
                    setCleanupNeedsConnectionReset(true);
                    setManualRetryError(true);
                    setCleanupPhase("manual_retry");
                  } else if (peerReloadFallbackTimerRef.current === null) {
                    // Safety fallback if initiating tab closed/crashed: clear persistence locally
                    // before reloading; if initiating tab is still clearing, retry up to 6 times,
                    // or surface instructions if a deletion remains pending beyond a bounded wait.
                    const scheduleFallbackCheck = (attempt = 0) => {
                      peerReloadFallbackTimerRef.current = setTimeout(() => {
                        peerReloadFallbackTimerRef.current = null;
                        if (!isCurrentRequest()) return;
                        if (peerCacheClearedRef.current) {
                          triggerPeerReloadIfReady();
                          return;
                        }
                        let settled = false;
                        const clearPromise = getOrStartClearPersistence(activeDb);
                        if (peerClearPendingTimerRef.current !== null) {
                          clearTimeout(peerClearPendingTimerRef.current);
                        }
                        peerClearPendingTimerRef.current = setTimeout(() => {
                          peerClearPendingTimerRef.current = null;
                          if (settled || !isCurrentRequest()) return;
                          pendingFirestoreCleanupRef.current = true;
                          terminatedDbRef.current = activeDb;
                          setCleanupBlockedByPending(true);
                          setCleanupPhase("manual_retry");
                        }, PEER_CACHE_CLEAR_PENDING_WAIT_MS);

                        void clearPromise.then(
                          () => {
                            settled = true;
                            if (peerClearPendingTimerRef.current !== null) {
                              clearTimeout(peerClearPendingTimerRef.current);
                              peerClearPendingTimerRef.current = null;
                            }
                            if (!isCurrentRequest()) return;
                            setCleanupBlockedByPending(false);
                            peerCacheClearedRef.current = true;
                            triggerPeerReloadIfReady();
                          },
                          () => {
                            settled = true;
                            if (peerClearPendingTimerRef.current !== null) {
                              clearTimeout(peerClearPendingTimerRef.current);
                              peerClearPendingTimerRef.current = null;
                            }
                            if (!isCurrentRequest()) return;
                            setCleanupBlockedByPending(false);
                            if (attempt < 5) {
                              scheduleFallbackCheck(attempt + 1);
                            } else {
                              pendingFirestoreCleanupRef.current = true;
                              terminatedDbRef.current = activeDb;
                              setCleanupPhase("manual_retry");
                            }
                          }
                        );
                      }, PEER_CACHE_CLEAR_FALLBACK_MS);
                    };
                    scheduleFallbackCheck(0);
                  }
                });
            } else {
              sendAck();
            }
          }
          break;
        case "LOGOUT_TERMINATE_DB_ACK": {
          const handler = pendingTerminateAcksRef.current.get(msg.requestId);
          if (handler) {
            handler(msg.tabId);
          }
          break;
        }
        case "LOGOUT_CACHE_CLEARED":
          if (msg.senderTabId !== myTabId) {
            if (
              !activeTerminateRequestIdRef.current ||
              msg.requestId !== activeTerminateRequestIdRef.current
            ) {
              break;
            }
            peerCacheClearedRef.current = true;
            triggerPeerReloadIfReady();
          }
          break;
      }
    };

    const announceHello = () => {
      // Protect drafts from an immediate null-user event until the peer HELLO handshake window settles
      helloHandshakeStateRef.current = "pending";
      if (handshakeTimerRef.current !== null) {
        clearTimeout(handshakeTimerRef.current);
      }
      handshakeTimerRef.current = setTimeout(() => {
        handshakeTimerRef.current = null;
        if (helloHandshakeStateRef.current === "pending") {
          helloHandshakeStateRef.current = "unknown";
        }
      }, PEER_LOGOUT_CHECK_TIMEOUT_MS);

      try {
        channel.postMessage({
          type: "HELLO",
          tabId: myTabId,
          hasPending: hasPendingOptimisticWrites(),
          hasDrafts: hasRetainedSubmitDrafts(),
        } satisfies AuthSyncMessage);
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
    const pendingSignedOutReservations = pendingSignedOutReservationsRef.current;
    const pendingPeerChecks = pendingPeerChecksRef.current;
    const pendingTerminateAcks = pendingTerminateAcksRef.current;
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", notifyBye);
      if (handshakeTimerRef.current !== null) {
        clearTimeout(handshakeTimerRef.current);
        handshakeTimerRef.current = null;
      }
      if (peerReloadFallbackTimerRef.current !== null) {
        clearTimeout(peerReloadFallbackTimerRef.current);
        peerReloadFallbackTimerRef.current = null;
      }
      if (peerClearPendingTimerRef.current !== null) {
        clearTimeout(peerClearPendingTimerRef.current);
        peerClearPendingTimerRef.current = null;
      }
      if (initiatorClearPendingTimerRef.current !== null) {
        clearTimeout(initiatorClearPendingTimerRef.current);
        initiatorClearPendingTimerRef.current = null;
      }
      helloHandshakeStateRef.current = "settled";
      notifyBye();
      channelRef.current = null;
      peerTabs.clear();
      for (const reservationId of peerReservations.keys()) {
        activeReservationStore.releaseLogoutReservation(reservationId);
      }
      peerReservations.clear();
      for (const reservationId of pendingSignedOutReservations.values()) {
        activeReservationStore.releaseLogoutReservation(reservationId);
      }
      pendingSignedOutReservations.clear();
      pendingPeerChecks.clear();
      pendingTerminateAcks.clear();
      channel.close();
    };
  }, [activeReservationStore, getOrStartClearPersistence, triggerPeerReloadIfReady]);

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
        if (responded.size >= expectedPeers.size) {
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

  const terminatePeerFirestoreTabs = useCallback(async (): Promise<string | null> => {
    const channel = channelRef.current;
    const peers = peerTabsRef.current;
    if (!channel || peers.size === 0) return null;

    const expectedPeers = new Set(peers);
    const acked = new Set<string>();
    const requestId = `term-${tabIdRef.current}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        pendingTerminateAcksRef.current.delete(requestId);
        resolve();
      };

      const timeoutId = setTimeout(finish, PEER_TERMINATE_TIMEOUT_MS);
      pendingTerminateAcksRef.current.set(requestId, (tabId) => {
        if (expectedPeers.has(tabId)) {
          acked.add(tabId);
        }
        if (acked.size >= expectedPeers.size) {
          finish();
        }
      });

      try {
        channel.postMessage({
          type: "LOGOUT_TERMINATE_DB_REQUEST",
          requestId,
          senderTabId: tabIdRef.current,
        } satisfies AuthSyncMessage);
      } catch {
        finish();
      }
    });

    return requestId;
  }, []);

  const runInitiatorClearWithWatchdog = useCallback(
    async (targetDb: Firestore) => {
      if (initiatorClearPendingTimerRef.current !== null) {
        clearTimeout(initiatorClearPendingTimerRef.current);
      }
      let settled = false;
      const clearPromise = getOrStartClearPersistence(targetDb);
      initiatorClearPendingTimerRef.current = setTimeout(() => {
        initiatorClearPendingTimerRef.current = null;
        if (settled) return;
        pendingFirestoreCleanupRef.current = true;
        terminatedDbRef.current = targetDb;
        setCleanupBlockedByPending(true);
        setCleanupPhase("manual_retry");
      }, PEER_CACHE_CLEAR_PENDING_WAIT_MS);

      try {
        await clearPromise;
      } finally {
        settled = true;
        if (initiatorClearPendingTimerRef.current !== null) {
          clearTimeout(initiatorClearPendingTimerRef.current);
          initiatorClearPendingTimerRef.current = null;
        }
      }

      if (initiatorFinalizingRef.current) return;
      initiatorFinalizingRef.current = true;
      clearPendingCleanupMarker();
      const reqId = initiatorTerminateRequestIdRef.current;
      initiatorTerminateRequestIdRef.current = null;
      if (reqId) {
        try {
          channelRef.current?.postMessage({
            type: "LOGOUT_CACHE_CLEARED",
            requestId: reqId,
            senderTabId: tabIdRef.current,
          } satisfies AuthSyncMessage);
        } catch {
          // Ignore broadcast errors during logout
        }
      }
      if (!canReadPendingCleanupStorage()) {
        // Storage remains unreadable: keep cleanup gate active rather than reloading into an unverified state
        initiatorFinalizingRef.current = false;
        pendingFirestoreCleanupRef.current = true;
        terminatedDbRef.current = targetDb;
        setCleanupBlockedByPending(false);
        setCleanupNeedsConnectionReset(false);
        setManualRetryError(true);
        setCleanupPhase("manual_retry");
        return;
      }
      if (verifyIdbCleanOnFinalizeRef.current) {
        const idbStatus = await checkStartupFirestoreIndexedDb(targetDb);
        if (idbStatus === "error") {
          // IndexedDB enumeration still rejects: hold cleanup gate rather than reloading into an unverified loop
          initiatorFinalizingRef.current = false;
          pendingFirestoreCleanupRef.current = true;
          terminatedDbRef.current = targetDb;
          setCleanupBlockedByPending(false);
          setCleanupNeedsConnectionReset(false);
          setManualRetryError(true);
          setCleanupPhase("manual_retry");
          return;
        }
        verifyIdbCleanOnFinalizeRef.current = false;
      }
      pendingFirestoreCleanupRef.current = false;
      cleanupRoleRef.current = null;
      terminatedDbRef.current = null;
      setCleanupBlockedByPending(false);
      setCleanupNeedsConnectionReset(false);
      setCleanupPhase("idle");
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
    [getOrStartClearPersistence]
  );

  const runStartupCleanup = useCallback(
    async (
      freshDb: Firestore,
      {
        requireConsentCheck,
        initialRequestId = null,
        isCancelled,
      }: {
        requireConsentCheck: boolean;
        initialRequestId?: string | null;
        isCancelled: () => boolean;
      }
    ) => {
      // Defer past synchronous effect execution so React hooks lint rules see async state transitions only
      await Promise.resolve();
      if (isCancelled()) return;
      try {
        let terminateRequestId = initialRequestId;
        if (requireConsentCheck) {
          pendingFirestoreCleanupRef.current = true;
          setLogoutCleanupGateActive(true);
          await waitForHelloHandshake();
          if (isCancelled()) return;
          const startupCheck = await confirmPendingWritesBeforeLogout(
            freshDb,
            requestDiscardConfirmation,
            queryPeerTabsBeforeLogout
          );
          if (isCancelled()) return;
          if (!startupCheck.canProceed) {
            enterPostSignOutDeclinedHold();
            return;
          }
          preserveDraftOnSignOutDeclineRef.current = false;
          postSignOutDeclinedRef.current = false;
          clearRetainedSubmitDraft();
          try {
            channelRef.current?.postMessage({
              type: "LOGOUT_CLEAR_DRAFTS",
              senderTabId: tabIdRef.current,
            } satisfies AuthSyncMessage);
          } catch {
            // Ignore broadcast errors during startup cleanup
          }
          terminateRequestId =
            (await terminatePeerFirestoreTabs()) ??
            `term-${tabIdRef.current || "local"}-${Date.now()}-${logoutSequenceRef.current}`;
          if (isCancelled()) return;
          const markerPersisted = writePendingCleanupMarker(terminateRequestId);
          setManualRetryError(!markerPersisted);
        } else {
          setManualRetryError(false);
        }
        cleanupRoleRef.current = "initiator";
        terminatedDbRef.current = freshDb;
        initiatorTerminateSucceededRef.current = false;
        initiatorTerminateRequestIdRef.current = terminateRequestId;
        initiatorFinalizingRef.current = false;
        setCleanupBlockedByPending(false);
        setCleanupNeedsConnectionReset(false);
        setCleanupPhase("pending");
        setLogoutCleanupGateActive(false);
        await terminate(freshDb);
        initiatorTerminateSucceededRef.current = true;
        await runInitiatorClearWithWatchdog(freshDb);
      } catch {
        if (isCancelled()) return;
        pendingFirestoreCleanupRef.current = true;
        cleanupRoleRef.current = "initiator";
        terminatedDbRef.current = freshDb;
        setLogoutCleanupGateActive(false);
        setCleanupBlockedByPending(false);
        setCleanupNeedsConnectionReset(!initiatorTerminateSucceededRef.current);
        setManualRetryError(true);
        setCleanupPhase("manual_retry");
      }
    },
    [
      enterPostSignOutDeclinedHold,
      queryPeerTabsBeforeLogout,
      requestDiscardConfirmation,
      runInitiatorClearWithWatchdog,
      terminatePeerFirestoreTabs,
      waitForHelloHandshake,
    ]
  );

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;
    let authGeneration = 0;
    const probeAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const generation = ++authGeneration;
      if (!currentUser) {
        deferredAuthUserRef.current = null;
        // Defer draft invalidation while handshake, unknown dirty outcome, consent flow, or decline hold is active
        const hasLocalDirtyState = hasPendingOptimisticWrites() || hasRetainedSubmitDrafts();
        if (
          logoutInProgressRef.current ||
          holdClearOnConsentTabRef.current ||
          preserveDraftOnSignOutDeclineRef.current ||
          (hasLocalDirtyState &&
            (helloHandshakeStateRef.current === "pending" ||
              helloHandshakeStateRef.current === "unknown"))
        ) {
          // Preserve dirty draft until consent resolves or explicit LOGOUT_CLEAR_DRAFTS arrives
        } else {
          clearRetainedSubmitDraft();
        }
        if (!cancelled && generation === authGeneration) {
          signedOutAppliedRef.current = true;
          const willRunStartupCacheCheck = Boolean(
            db &&
              typeof window !== "undefined" &&
              !initialPersistedCleanup &&
              !startupCacheCheckStartedRef.current &&
              !pendingFirestoreCleanupRef.current &&
              cleanupRoleRef.current === null &&
              !logoutInProgressRef.current &&
              window.indexedDB
          );
          setUser(null);
          setIsAuthorizedStaff(false);
          setLoading(willRunStartupCacheCheck || startupCacheCheckInFlightRef.current);
          for (const reservationId of pendingSignedOutReservationsRef.current) {
            activeReservationStoreRef.current.releaseLogoutReservation(reservationId);
          }
          pendingSignedOutReservationsRef.current.clear();
          triggerPeerReloadIfReady();

          // Startup fallback when all synchronous cleanup markers failed or were unavailable before refresh:
          // if signed out with leftover Firestore IndexedDB persistence on disk, purge it before any sign-in resumes.
          if (willRunStartupCacheCheck && db) {
            const freshDb = db;
            startupCacheCheckStartedRef.current = true;
            startupCacheCheckInFlightRef.current = true;
            setStartupCacheChecking(true);
            let probeTimedOut = false;
            void checkStartupFirestoreIndexedDb(freshDb, {
              signal: probeAbortController?.signal,
              onPending: () => {
                if (
                  cancelled ||
                  startupCleanupStartedRef.current ||
                  cleanupRoleRef.current !== null ||
                  logoutInProgressRef.current
                ) {
                  return;
                }
                probeTimedOut = true;
                startupCacheCheckInFlightRef.current = false;
                deferredAuthUserRef.current = null;
                pendingFirestoreCleanupRef.current = true;
                terminatedDbRef.current = freshDb;
                setStartupCacheChecking(false);
                setUser(null);
                setIsAuthorizedStaff(false);
                setLoading(false);
                setCleanupBlockedByPending(true);
                setCleanupNeedsConnectionReset(false);
                setCleanupPhase("manual_retry");
              },
            }).then((idbStatus) => {
              startupCacheCheckInFlightRef.current = false;
              if (cancelled) return;
              if (
                startupCleanupStartedRef.current ||
                cleanupRoleRef.current !== null ||
                logoutInProgressRef.current ||
                postSignOutDeclinedRef.current
              ) {
                return;
              }
              if (idbStatus !== "clean" && (!pendingFirestoreCleanupRef.current || probeTimedOut)) {
                startupCleanupStartedRef.current = true;
                verifyIdbCleanOnFinalizeRef.current = idbStatus === "error";
                deferredAuthUserRef.current = null;
                pendingFirestoreCleanupRef.current = true;
                setCleanupBlockedByPending(false);
                setLogoutCleanupGateActive(true);
                setStartupCacheChecking(false);
                setUser(null);
                setIsAuthorizedStaff(false);
                setLoading(false);
                void runStartupCleanup(freshDb, {
                  requireConsentCheck: true,
                  isCancelled: () => cancelled,
                });
                return;
              }
              if (probeTimedOut && idbStatus === "clean") {
                pendingFirestoreCleanupRef.current = false;
                terminatedDbRef.current = null;
                setCleanupBlockedByPending(false);
                setCleanupNeedsConnectionReset(false);
                setCleanupPhase("idle");
              }
              setStartupCacheChecking(false);
              const deferred = deferredAuthUserRef.current;
              deferredAuthUserRef.current = null;
              if (
                deferred &&
                deferred.generation === authGeneration &&
                !pendingFirestoreCleanupRef.current
              ) {
                setLoading(true);
                void checkIsAuthorizedStaff(deferred.user).then((authorized) => {
                  if (
                    !cancelled &&
                    deferred.generation === authGeneration &&
                    !pendingFirestoreCleanupRef.current
                  ) {
                    setUser(deferred.user);
                    setIsAuthorizedStaff(authorized);
                    setLoading(false);
                  }
                });
              } else {
                setLoading(false);
              }
            });
          }
        }
        return;
      }

      signedOutAppliedRef.current = false;
      if (pendingFirestoreCleanupRef.current) {
        // Keep sign-in and operational routes blocked until terminated Firestore cache cleanup completes
        setUser(null);
        setIsAuthorizedStaff(false);
        setLoading(false);
        return;
      }
      if (startupCacheCheckInFlightRef.current) {
        deferredAuthUserRef.current = { user: currentUser, generation };
        setLoading(true);
        return;
      }
      deferredAuthUserRef.current = null;
      setLoading(true);
      void checkIsAuthorizedStaff(currentUser).then((authorized) => {
        if (!cancelled && generation === authGeneration && !pendingFirestoreCleanupRef.current) {
          setUser(currentUser);
          setIsAuthorizedStaff(authorized);
          setLoading(false);
        }
      });
    });

    return () => {
      cancelled = true;
      probeAbortController?.abort();
      startupCacheCheckInFlightRef.current = false;
      deferredAuthUserRef.current = null;
      authGeneration += 1;
      unsubscribe();
    };
  }, [initialPersistedCleanup, runStartupCleanup, triggerPeerReloadIfReady]);

  useEffect(() => {
    if (
      !initialPersistedCleanup ||
      initialPersistedCleanup.declinedHold ||
      persistedCleanupRanRef.current
    ) {
      return;
    }

    if (!db || typeof window === "undefined") {
      persistedCleanupRanRef.current = true;
      clearPendingCleanupMarker();
      pendingFirestoreCleanupRef.current = false;
      cleanupRoleRef.current = null;
      terminatedDbRef.current = null;
      initiatorTerminateRequestIdRef.current = null;
      void Promise.resolve().then(() => {
        setCleanupPhase("idle");
      });
      return;
    }

    let cancelled = false;
    const freshDb = db;
    void Promise.resolve().then(() => {
      if (cancelled || persistedCleanupRanRef.current) return;
      persistedCleanupRanRef.current = true;
      startupCleanupStartedRef.current = true;
      void runStartupCleanup(freshDb, {
        requireConsentCheck: Boolean(initialPersistedCleanup.storageError),
        initialRequestId: initialPersistedCleanup.requestId,
        isCancelled: () => cancelled,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [initialPersistedCleanup, runStartupCleanup]);

  const logout = useCallback(async () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    const ownerTabId = tabIdRef.current || "local";
    const selfReservationId = `self-logout-${ownerTabId}-${++logoutSequenceRef.current}`;
    activeLogoutReservationIdRef.current = selfReservationId;
    logoutConsentedRef.current = false;
    preserveDraftOnSignOutDeclineRef.current = false;
    joinedDirtyDuringLogoutRef.current = { hasPending: false, hasDrafts: false };
    activeReservationStore.reserveSubmissionsForLogout(selfReservationId, LOGOUT_RESERVATION_TTL_MS);
    const issuedRequestIds: string[] = [];
    let logoutCommitted = false;
    let terminationStarted = false;
    // Periodically renew the short-lived lease while confirmation or signOut is in flight
    const renewIntervalId =
      typeof window !== "undefined"
        ? setInterval(() => {
            activeReservationStore.reserveSubmissionsForLogout(
              selfReservationId,
              LOGOUT_RESERVATION_TTL_MS
            );
            try {
              channelRef.current?.postMessage({
                type: "LOGOUT_RESERVATION_RENEW",
                requestIds: [selfReservationId, ...issuedRequestIds],
                senderTabId: tabIdRef.current,
              } satisfies AuthSyncMessage);
            } catch {
              // Ignore broadcast errors during slow logout
            }
          }, LOGOUT_RESERVATION_RENEW_INTERVAL_MS)
        : null;

    const queryPeerTabsWithJoinedDirty = async (): Promise<PeerTabDirtyState> => {
      const peerState = await queryPeerTabsBeforeLogout(issuedRequestIds);
      return {
        hasPending: peerState.hasPending || joinedDirtyDuringLogoutRef.current.hasPending,
        hasDrafts: peerState.hasDrafts || joinedDirtyDuringLogoutRef.current.hasDrafts,
        hasUnknownPeer: peerState.hasUnknownPeer,
      };
    };

    try {
      let confirmedDiscard = false;
      if (typeof window !== "undefined") {
        const initialCheck = await confirmPendingWritesBeforeLogout(
          db,
          requestDiscardConfirmation,
          queryPeerTabsWithJoinedDirty
        );
        if (!initialCheck.canProceed) {
          if (postSignOutDeclinedRef.current) {
            enterPostSignOutDeclinedHold();
          }
          return;
        }
        confirmedDiscard = initialCheck.confirmedDiscard;
        logoutConsentedRef.current = confirmedDiscard;

        // Re-check immediately before signOut/cleanup in case a late write or peer draft appeared during wait
        if (!confirmedDiscard) {
          const latePeerState = await queryPeerTabsWithJoinedDirty();
          if (
            hasPendingOptimisticWrites() ||
            hasRetainedSubmitDrafts() ||
            latePeerState.hasPending ||
            latePeerState.hasDrafts ||
            latePeerState.hasUnknownPeer
          ) {
            const lateCheck = await confirmPendingWritesBeforeLogout(
              db,
              requestDiscardConfirmation,
              queryPeerTabsWithJoinedDirty
            );
            if (!lateCheck.canProceed) {
              if (postSignOutDeclinedRef.current) {
                enterPostSignOutDeclinedHold();
              }
              return;
            }
            confirmedDiscard = lateCheck.confirmedDiscard;
            logoutConsentedRef.current = confirmedDiscard;
          }
        }
      }

      if (auth && !postSignOutDeclinedRef.current) {
        pendingFirestoreCleanupRef.current = true;
        setLogoutCleanupGateActive(true);
        await signOut(auth);
      }

      // If a tab joined or restored from bfcache with retained dirty state while signOut was in flight, confirm before wiping
      if (
        !confirmedDiscard &&
        typeof window !== "undefined" &&
        (joinedDirtyDuringLogoutRef.current.hasPending ||
          joinedDirtyDuringLogoutRef.current.hasDrafts)
      ) {
        const postSignOutCheck = await confirmPendingWritesBeforeLogout(
          db,
          requestDiscardConfirmation,
          queryPeerTabsWithJoinedDirty
        );
        if (!postSignOutCheck.canProceed) {
          enterPostSignOutDeclinedHold();
          return;
        }
        logoutConsentedRef.current = postSignOutCheck.confirmedDiscard;
      }
      postSignOutDeclinedRef.current = false;
      logoutCommitted = true;

      preserveDraftOnSignOutDeclineRef.current = false;
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
        setLogoutCleanupGateActive(true);
        const terminateRequestId =
          (await terminatePeerFirestoreTabs()) ??
          `term-${ownerTabId}-${Date.now()}-${logoutSequenceRef.current}`;
        terminationStarted = true;
        const markerPersisted = writePendingCleanupMarker(terminateRequestId);
        pendingFirestoreCleanupRef.current = true;
        cleanupRoleRef.current = "initiator";
        terminatedDbRef.current = db;
        initiatorTerminateSucceededRef.current = false;
        initiatorTerminateRequestIdRef.current = terminateRequestId;
        initiatorFinalizingRef.current = false;
        setCleanupBlockedByPending(false);
        setCleanupNeedsConnectionReset(false);
        setManualRetryError(!markerPersisted);
        setCleanupPhase("pending");
        setLogoutCleanupGateActive(false);
        setUser(null);
        setIsAuthorizedStaff(false);
        try {
          await terminate(db);
          initiatorTerminateSucceededRef.current = true;
          await runInitiatorClearWithWatchdog(db);
        } catch {
          // Keep access blocked and offer retry; do NOT reload with stale PHI in IndexedDB
          pendingFirestoreCleanupRef.current = true;
          setCleanupBlockedByPending(false);
          setCleanupNeedsConnectionReset(!initiatorTerminateSucceededRef.current);
          setManualRetryError(true);
          setCleanupPhase("manual_retry");
        }
      }
    } finally {
      if (!terminationStarted && !postSignOutDeclinedRef.current) {
        pendingFirestoreCleanupRef.current = false;
        setLogoutCleanupGateActive(false);
      }
      if (renewIntervalId !== null) {
        clearInterval(renewIntervalId);
      }
      activeLogoutReservationIdRef.current = null;
      logoutConsentedRef.current = false;
      joinedDirtyDuringLogoutRef.current = { hasPending: false, hasDrafts: false };
      activeReservationStore.releaseLogoutReservation(selfReservationId);
      if (!logoutCommitted) {
        for (const requestId of [selfReservationId, ...issuedRequestIds]) {
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
  }, [
    enterPostSignOutDeclinedHold,
    queryPeerTabsBeforeLogout,
    terminatePeerFirestoreTabs,
    requestDiscardConfirmation,
    activeReservationStore,
    runInitiatorClearWithWatchdog,
  ]);

  const handleManualRetryCleanup = useCallback(async () => {
    if (manualRetryInFlight) return;
    const targetDb = terminatedDbRef.current ?? db;
    if (!targetDb) return;

    // Never retry a rejected terminate(targetDb) on the same Firestore instance;
    // persist the non-PHI cleanup marker first and reload only if the gate survived into storage.
    const roleTerminationSucceeded =
      cleanupRoleRef.current === "initiator"
        ? initiatorTerminateSucceededRef.current
        : cleanupRoleRef.current === "peer"
          ? peerTerminateSucceededRef.current
          : true;
    if (cleanupRoleRef.current !== null && !roleTerminationSucceeded) {
      const requestId =
        cleanupRoleRef.current === "initiator"
          ? initiatorTerminateRequestIdRef.current
          : activeTerminateRequestIdRef.current;
      const markerPersisted = writePendingCleanupMarker(requestId);
      if (!markerPersisted) {
        pendingFirestoreCleanupRef.current = true;
        setCleanupBlockedByPending(false);
        setCleanupNeedsConnectionReset(true);
        setManualRetryError(true);
        setCleanupPhase("manual_retry");
        return;
      }
      if (typeof window !== "undefined") {
        window.location.reload();
      }
      return;
    }

    setManualRetryInFlight(true);
    setManualRetryError(false);
    try {
      if (cleanupRoleRef.current === "initiator") {
        await runInitiatorClearWithWatchdog(targetDb);
      } else if (cleanupRoleRef.current === null && pendingFirestoreCleanupRef.current) {
        if (!startupCleanupStartedRef.current) {
          startupCleanupStartedRef.current = true;
          verifyIdbCleanOnFinalizeRef.current = true;
          await runStartupCleanup(targetDb, {
            requireConsentCheck: true,
            isCancelled: () => false,
          });
        }
      } else {
        await getOrStartClearPersistence(targetDb);
        setCleanupBlockedByPending(false);
        peerCacheClearedRef.current = true;
        peerDbTerminatedRef.current = true;
        triggerPeerReloadIfReady();
      }
    } catch {
      pendingFirestoreCleanupRef.current = true;
      setCleanupBlockedByPending(false);
      setCleanupPhase("manual_retry");
      setManualRetryError(true);
    } finally {
      setManualRetryInFlight(false);
    }
  }, [
    getOrStartClearPersistence,
    manualRetryInFlight,
    runInitiatorClearWithWatchdog,
    runStartupCleanup,
    triggerPeerReloadIfReady,
  ]);

  const showCleanupDialog =
    !logoutDiscardPrompt && (cleanupPhase === "manual_retry" || cleanupPhase === "declined_hold");

  useLayoutEffect(() => {
    if (!showCleanupDialog) return;

    // Move keyboard focus into the cleanup gate dialog immediately when it appears
    if (cleanupRetryButtonRef.current && !cleanupRetryButtonRef.current.disabled) {
      cleanupRetryButtonRef.current.focus();
    } else {
      cleanupDialogRef.current?.focus();
    }

    const inertApplied: HTMLElement[] = [];
    const appShell = document.getElementById("app-shell-root");
    if (appShell) {
      if (!appShell.hasAttribute("inert")) {
        appShell.setAttribute("inert", "");
        inertApplied.push(appShell);
      }
    } else if (cleanupBackdropRef.current?.parentElement) {
      Array.from(cleanupBackdropRef.current.parentElement.children).forEach((sibling) => {
        if (
          sibling instanceof HTMLElement &&
          sibling !== cleanupBackdropRef.current &&
          !sibling.hasAttribute("inert")
        ) {
          sibling.setAttribute("inert", "");
          inertApplied.push(sibling);
        }
      });
    }

    return () => {
      inertApplied.forEach((el) => el.removeAttribute("inert"));
    };
  }, [showCleanupDialog]);

  useEffect(() => {
    if (!showCleanupDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Dismissal must not bypass the Firestore cleanup gate
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Tab" && cleanupDialogRef.current) {
        const focusable = Array.from(
          cleanupDialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([aria-hidden="true"]), [href]:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"])'
          )
        );
        if (focusable.length === 0) {
          e.preventDefault();
          cleanupDialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !cleanupDialogRef.current.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (
        cleanupDialogRef.current &&
        e.target instanceof Node &&
        !cleanupDialogRef.current.contains(e.target)
      ) {
        if (cleanupRetryButtonRef.current && !cleanupRetryButtonRef.current.disabled) {
          cleanupRetryButtonRef.current.focus();
        } else {
          cleanupDialogRef.current.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [showCleanupDialog]);

  const isPendingCleanup =
    cleanupPhase !== "idle" || startupCacheChecking || logoutCleanupGateActive;

  return (
    <AuthContext.Provider value={{ user, loading, isAuthorizedStaff, isPendingCleanup, logout }}>
      {children}
      {showCleanupDialog && (
        <div
          ref={cleanupBackdropRef}
          className="fixed inset-0 z-[130] bg-paper-3/90 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cleanup-retry-title"
          aria-describedby="cleanup-retry-desc"
        >
          <div
            ref={cleanupDialogRef}
            tabIndex={-1}
            className="w-full max-w-md rounded-[10px] border border-rule bg-paper-2 p-6 focus:outline-none"
          >
            <h2 id="cleanup-retry-title" className="text-lg font-medium text-ink mb-2">
              {cleanupPhase === "declined_hold"
                ? "ออกจากระบบค้างไว้เพื่อรักษาข้อมูลร่าง"
                : "จำเป็นต้องล้างข้อมูลแคชก่อนใช้งานต่อ"}
            </h2>
            <p id="cleanup-retry-desc" className="text-sm text-ink-2 mb-4">
              {cleanupPhase === "declined_hold"
                ? "ระบบได้ออกจากระบบบัญชีเดิมแล้ว แต่ยังไม่ล้างข้อมูลแคชเพื่อรักษาข้อมูลร่างในแท็บอื่น กรุณาตรวจสอบหรือบันทึกข้อมูลในแท็บนั้นให้เรียบร้อย แล้วกดปุ่มด้านล่างเพื่อล้างแคชก่อนเข้าสู่ระบบบัญชีใหม่"
                : cleanupBlockedByPending
                  ? "การล้างข้อมูลแคชในเบราว์เซอร์ยังรอดำเนินการอยู่ กรุณาปิดแท็บอื่นของระบบที่เปิดค้างไว้ แล้วระบบจะล้างแคชและโหลดหน้าใหม่อัตโนมัติ"
                  : cleanupNeedsConnectionReset
                    ? "ไม่สามารถปิดการเชื่อมต่อฐานข้อมูลเดิมได้อัตโนมัติ กรุณากดปุ่มด้านล่างเพื่อรีโหลดหน้า ปลดการเชื่อมต่อเดิม และยืนยันการล้างแคชให้สมบูรณ์ก่อนเข้าสู่ระบบ"
                    : "ระบบยังไม่สามารถล้างข้อมูลผู้ป่วยในเบราว์เซอร์ได้อัตโนมัติ (อาจมีแท็บอื่นเปิดค้างอยู่) กรุณาปิดแท็บอื่นของระบบแล้วกดลองล้างแคชอีกครั้งเพื่อความปลอดภัย"}
            </p>
            {manualRetryError && (
              <p role="alert" className="text-xs font-medium text-bad bg-bad-soft border border-bad/35 rounded-[6px] px-3 py-2 mb-4">
                {cleanupPhase === "declined_hold"
                  ? "ไม่สามารถบันทึกสถานะพักการออกจากระบบลงในเบราว์เซอร์ได้ กรุณาตรวจสอบแท็บอื่นและยืนยันการล้างแคชให้เรียบร้อยก่อนรีเฟรชหน้า"
                  : "การล้างแคชยังไม่สำเร็จ กรุณาปิดแท็บอื่นที่เปิดค้างอยู่แล้วลองใหม่อีกครั้ง"}
              </p>
            )}
            <button
              ref={cleanupRetryButtonRef}
              type="button"
              onClick={() =>
                void (cleanupPhase === "declined_hold" ? logout() : handleManualRetryCleanup())
              }
              disabled={cleanupPhase === "manual_retry" && manualRetryInFlight}
              className="w-full px-4 py-2.5 rounded-[6px] bg-accent text-accent-ink font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed tap-feedback"
            >
              {cleanupPhase === "declined_hold"
                ? "ตรวจสอบและล้างแคชต่อ"
                : manualRetryInFlight
                  ? "กำลังล้างแคช…"
                  : "ลองล้างแคชและโหลดหน้าใหม่"}
            </button>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={Boolean(logoutDiscardPrompt)}
        title="ยืนยันการออกจากระบบ"
        message={logoutDiscardPrompt?.message ?? ""}
        confirmText="ยืนยันละทิ้งและออกจากระบบ"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={() => settleDiscardPrompt(true)}
        onCancel={() => settleDiscardPrompt(false)}
      />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
