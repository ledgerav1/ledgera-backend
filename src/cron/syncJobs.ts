import cron from "node-cron";
import type { PayrollOAuthTokens } from "../integrations/payrollProvider";
import { prisma } from "../prismaClient";

import {
  getQuickBooksTokensForCompany,
  getServiceTitanTokensForCompany,
  getGustoTokensForCompany,
  getAdpWorkforceNowTokensForCompany,
  getPaychexFlexTokensForCompany,
} from "../integrations/integrationCredentialService";
import {
  syncQuickBooksAndRefresh,
  syncServiceTitanAndRefresh,
  syncPayrollAndRefresh,
} from "../integrations/integrationSyncService";


let started = false;

export function startCronJobs(): void {
  if (started) return;
  started = true;

  // Runs daily at 2AM
  cron.schedule("0 2 * * *", async () => {
    const companies = await prisma.company.findMany();

    for (const company of companies) {
      try {
        const [
          serviceTitanTokens,
          quickBooksTokens,

          gustoTokens,
          adpTokens,
          paychexTokens,
        ] = await Promise.all([
          getServiceTitanTokensForCompany(company.id).catch(() => null),
          getQuickBooksTokensForCompany(company.id).catch(() => null),

          getGustoTokensForCompany(company.id).catch(() => null),
          getAdpWorkforceNowTokensForCompany(company.id).catch(() => null),
          getPaychexFlexTokensForCompany(company.id).catch(() => null),
        ]);

        if (serviceTitanTokens) {
          await syncServiceTitanAndRefresh(serviceTitanTokens, company.id);
        }

        if (quickBooksTokens) {
          await syncQuickBooksAndRefresh(quickBooksTokens, company.id);
        }

        const payrollTokens: PayrollOAuthTokens[] = [];

        if (gustoTokens) payrollTokens.push({ provider: "gusto", tokens: gustoTokens });
        if (adpTokens) payrollTokens.push({ provider: "adpWorkforceNow", tokens: adpTokens });
        if (paychexTokens) payrollTokens.push({ provider: "paychexFlex", tokens: paychexTokens });

        for (const tokens of payrollTokens) {
          await syncPayrollAndRefresh(tokens, company.id);
        }
      } catch (err: unknown) {
        // Don’t block other companies if one fails
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Sync failed for companyId=${company.id}:`, message);
      }
    }
  });
}
