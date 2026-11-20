const DEFAULT_LOGOUT_RESERVATION_TTL_MS = 5000;
const logoutReservations = new Map<string, number>();

function pruneExpiredReservations(now: number = Date.now()): void {
  for (const [id, expiresAt] of logoutReservations.entries()) {
    if (expiresAt <= now) {
      logoutReservations.delete(id);
    }
  }
}

export function reserveSubmissionsForLogout(
  reservationId: string,
  ttlMs: number = DEFAULT_LOGOUT_RESERVATION_TTL_MS
): void {
  pruneExpiredReservations();
  logoutReservations.set(reservationId, Date.now() + ttlMs);
}

export function releaseLogoutReservation(reservationId: string): void {
  logoutReservations.delete(reservationId);
}

export function isSubmissionBlockedByLogout(): boolean {
  pruneExpiredReservations();
  return logoutReservations.size > 0;
}

export function clearAllLogoutReservationsForTests(): void {
  logoutReservations.clear();
}
