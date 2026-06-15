export type SyncHealthStatus = "healthy" | "degraded" | "unknown";

export type SyncHealthReport = {
  companyId: string;
  status: SyncHealthStatus;
  /**
   * ISO timestamp of last known sync attempt (or null if unknown).
   */
  lastSyncAttemptAtIso: string | null;
  issues: string[];
};

/**
 * Minimal sync health monitor stub.
 * Architecture-first: establishes a stable interface for future connector-level telemetry.
 */
export function evaluateSyncHealth(companyId: string): SyncHealthReport {
  return {
    companyId,
    status: "unknown",
    lastSyncAttemptAtIso: null,
    issues: ["Sync health monitoring not implemented yet (architecture stub)."],
  };
}
