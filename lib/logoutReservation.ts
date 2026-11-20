const DEFAULT_LOGOUT_RESERVATION_TTL_MS = 5000;

export interface LogoutReservationStore {
  reserveSubmissionsForLogout: (reservationId: string, ttlMs?: number) => void;
  releaseLogoutReservation: (reservationId: string) => void;
  isSubmissionBlockedByLogout: () => boolean;
  clear: () => void;
}

export function createLogoutReservationStore(): LogoutReservationStore {
  const logoutReservations = new Map<string, number>();

  const pruneExpiredReservations = (now: number = Date.now()): void => {
    for (const [id, expiresAt] of logoutReservations.entries()) {
      if (expiresAt <= now) {
        logoutReservations.delete(id);
      }
    }
  };

  return {
    reserveSubmissionsForLogout(
      reservationId: string,
      ttlMs: number = DEFAULT_LOGOUT_RESERVATION_TTL_MS
    ): void {
      pruneExpiredReservations();
      logoutReservations.set(reservationId, Date.now() + ttlMs);
    },
    releaseLogoutReservation(reservationId: string): void {
      logoutReservations.delete(reservationId);
    },
    isSubmissionBlockedByLogout(): boolean {
      pruneExpiredReservations();
      return logoutReservations.size > 0;
    },
    clear(): void {
      logoutReservations.clear();
    },
  };
}

const defaultLogoutReservationStore = createLogoutReservationStore();

export function reserveSubmissionsForLogout(
  reservationId: string,
  ttlMs: number = DEFAULT_LOGOUT_RESERVATION_TTL_MS
): void {
  defaultLogoutReservationStore.reserveSubmissionsForLogout(reservationId, ttlMs);
}

export function releaseLogoutReservation(reservationId: string): void {
  defaultLogoutReservationStore.releaseLogoutReservation(reservationId);
}

export function isSubmissionBlockedByLogout(): boolean {
  return defaultLogoutReservationStore.isSubmissionBlockedByLogout();
}

export function clearAllLogoutReservationsForTests(): void {
  defaultLogoutReservationStore.clear();
}
