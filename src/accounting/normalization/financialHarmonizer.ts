import type { SystemTransaction, UnifiedChartOfAccountsEntry } from "../types";

export type UnifiedTransaction = {
  externalId: string;
  date: string;
  amount: number;
  description?: string;

  /**
   * Minimal harmonization placeholder.
   * In a complete implementation, classification derives from normalized COA + vendor mapping.
   */
  unifiedType: string;
};

/**
 * Minimal financial harmonization stub.
 * Establishes an architectural boundary for translating system-specific transactions
 * into a unified reporting schema.
 */
export function harmonizeFinancialTransactions(
  transactions: SystemTransaction[],
  _normalizedCoa: UnifiedChartOfAccountsEntry[]
): UnifiedTransaction[] {
  return transactions.map((t) => ({
    externalId: t.externalId,
    date: t.date,
    amount: t.amount,
    description: t.description,
    unifiedType: "unknown",
  }));
}
