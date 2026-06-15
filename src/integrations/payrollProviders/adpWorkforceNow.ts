import type {
  PayrollExpenseRecord,
  PayrollOAuthTokens,
  PayrollProvider,
  PayrollSyncResult,
} from "../payrollProvider";

export type AdpWorkforceNowOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  workforceOrgId?: string;
};

export async function syncAdpWorkforceNowIntegration(
  tokens: AdpWorkforceNowOAuthTokens,
  companyId: string
): Promise<PayrollSyncResult> {
  // Stub: do not fail the entire sync pipeline; persist nothing until mappings exist.
  void tokens;
  void companyId;

  return {
    provider: "adpWorkforceNow",
    normalized: [],
    persistedCount: 0,
  };
}

export const provider: PayrollProvider = "adpWorkforceNow";

export function toPayrollExpenseRecord(_input: unknown): PayrollExpenseRecord {
  throw new Error("Not implemented");
}
