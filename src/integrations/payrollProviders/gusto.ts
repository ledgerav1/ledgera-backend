import type { PayrollExpenseRecord, PayrollOAuthTokens, PayrollProvider, PayrollSyncResult } from "../payrollProvider";

export type GustoOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  companyIdExternal?: string;
};

export async function syncGustoIntegration(
  tokens: GustoOAuthTokens,
  companyId: string
): Promise<PayrollSyncResult> {
  // Institutional placeholder:
  // When a client connects Gusto before we’ve implemented API mappings,
  // keep the sync job *operational* (no crashes), but persist nothing.
  void tokens;
  void companyId;

  return {
    provider: "gusto",
    normalized: [],
    persistedCount: 0,
  };
}

export const provider: PayrollProvider = "gusto";

export function toPayrollExpenseRecord(_input: unknown): PayrollExpenseRecord {
  throw new Error("Not implemented");
}
