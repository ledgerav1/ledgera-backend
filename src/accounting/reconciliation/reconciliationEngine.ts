import type {
  SystemAccount,
  SystemTransaction,
  UnifiedChartOfAccountsEntry,
} from "../types";

export type ReconciliationStatus = "matched" | "needs_review" | "unavailable";

export type ReconciliationLine = {
  /**
   * Source transaction/account external ids used to reconcile.
   */
  sourceId: string;
  /**
   * Optional unified ids if harmonization succeeded.
   */
  unifiedExternalId?: string;

  status: ReconciliationStatus;
  /**
   * Human readable reconciliation note.
   */
  reason?: string;
};

export type ReconciliationReport = {
  companyId: string;
  startedAtIso: string;
  finishedAtIso: string;

  coaNormalized?: boolean;

  /**
   * Stub reconciliation implementation:
   * - counts and classifications from provided data
   */
  lines: ReconciliationLine[];
};

/**
 * Minimal reconciliation engine.
 * For now, it performs deterministic “shape-based” reconciliation:
 * - accounts present -> matched
 * - transactions present -> needs_review (placeholders for vendor-specific matching)
 *
 * The intent is to establish a stable “institutional architecture” boundary
 * for future implementation of reconciliation rules.
 */
export function reconcile(
  companyId: string,
  accounts: SystemAccount[],
  transactions: SystemTransaction[],
  normalizedCoa: UnifiedChartOfAccountsEntry[]
): ReconciliationReport {
  const startedAtIso = new Date().toISOString();

  const normalizedSet = new Set(normalizedCoa.map((c) => c.externalId));

  const accountLines: ReconciliationLine[] = accounts.map((a) => {
    const normalizedExternalId = normalizedSet.has(a.externalId) ? a.externalId : undefined;
    return {
      sourceId: a.externalId,
      unifiedExternalId: normalizedExternalId,
      status: "matched",
    };
  });

  const transactionLines: ReconciliationLine[] = transactions.map((t) => ({
    sourceId: t.externalId,
    status: "needs_review",
    reason: "Transaction reconciliation rules not implemented yet (architecture stub).",
  }));

  const finishedAtIso = new Date().toISOString();

  return {
    companyId,
    startedAtIso,
    finishedAtIso,
    coaNormalized: normalizedCoa.length > 0,
    lines: [...accountLines, ...transactionLines],
  };
}
