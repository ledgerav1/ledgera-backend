import type {
  SystemAccount,
  UnifiedChartOfAccountsEntry,
  AccountingSystemType,
} from "../types";

type UnifiedType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense"
  | "unknown";

function unifyType(input: string): UnifiedType {
  const v = input.trim().toLowerCase();

  // Minimal harmonization mapping. Extend as connector schemas mature.
  if (v.includes("asset") || v.includes("cash") || v.includes("bank")) return "asset";
  if (v.includes("liability") || v.includes("ap") || v.includes("ar")) return "liability";
  if (v.includes("equity") || v.includes("owner")) return "equity";
  if (v.includes("income") || v.includes("revenue") || v.includes("sales")) return "income";
  if (v.includes("expense") || v.includes("cost") || v.includes("cogs")) return "expense";
  return "unknown";
}

export type NormalizeCOAOptions = {
  /**
   * Optional override used when you already know the connector system.
   * If omitted, the `sourceSystem` is set to "quickbooks" by default.
   */
  sourceSystem?: AccountingSystemType;
};

/**
 * Normalize vendor-specific accounts into a unified COA shape.
 */
export function normalizeChartOfAccounts(
  accounts: SystemAccount[],
  options: NormalizeCOAOptions = {}
): UnifiedChartOfAccountsEntry[] {
  const sourceSystem: AccountingSystemType = options.sourceSystem ?? "quickbooks";

  return accounts.map((a) => ({
    externalId: a.externalId,
    name: a.name,
    unifiedType: unifyType(a.type),
    sourceSystem,
  }));
}
