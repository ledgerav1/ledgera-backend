import type { Prisma } from "@prisma/client";
import type { AdpWorkforceNowOAuthTokens } from "./payrollProviders/adpWorkforceNow";
import { syncAdpWorkforceNowIntegration } from "./payrollProviders/adpWorkforceNow";
import type { GustoOAuthTokens } from "./payrollProviders/gusto";
import { syncGustoIntegration } from "./payrollProviders/gusto";
import type { PaychexFlexOAuthTokens } from "./payrollProviders/paychexFlex";
import { syncPaychexFlexIntegration } from "./payrollProviders/paychexFlex";

export type PayrollProvider = "gusto" | "adpWorkforceNow" | "paychexFlex";

export type PayrollOAuthTokens =
  | { provider: "gusto"; tokens: GustoOAuthTokens }
  | { provider: "adpWorkforceNow"; tokens: AdpWorkforceNowOAuthTokens }
  | { provider: "paychexFlex"; tokens: PaychexFlexOAuthTokens };

export async function syncPayrollIntegration(tokens: PayrollOAuthTokens, companyId: string) {
  switch (tokens.provider) {
    case "gusto":
      return syncGustoIntegration(tokens.tokens, companyId);
    case "adpWorkforceNow":
      return syncAdpWorkforceNowIntegration(tokens.tokens, companyId);
    case "paychexFlex":
      return syncPaychexFlexIntegration(tokens.tokens, companyId);
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = tokens;
      return _exhaustive;
    }
  }
}

/**
 * Shared persistence contract for payroll vendors.
 * Adapters should convert vendor labor/payroll entities into a normalized list.
 */
export type PayrollExpenseRecord = {
  externalId: string;
  amount: number;
  postedAt: Date;
  category?: string;
};

/**
 * Utility type for adapters that want to return normalized records.
 */
export type PayrollSyncResult = {
  provider: PayrollProvider;
  normalized: PayrollExpenseRecord[];
  persistedCount: number;
} & Record<string, unknown>;
