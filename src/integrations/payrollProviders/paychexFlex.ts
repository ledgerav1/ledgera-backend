import type { PayrollExpenseRecord, PayrollProvider, PayrollSyncResult } from "../payrollProvider";

export type PaychexFlexOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  paychexAccountId?: string;
};

export async function syncPaychexFlexIntegration(
  tokens: PaychexFlexOAuthTokens,
  companyId: string
): Promise<PayrollSyncResult> {
  void tokens;
  void companyId;

  throw new Error("Paychex Flex payroll sync not implemented yet");
}

export const provider: PayrollProvider = "paychexFlex";

export function toPayrollExpenseRecord(_input: unknown): PayrollExpenseRecord {
  throw new Error("Not implemented");
}
