import cron from "node-cron";
import { prisma } from "../prismaClient";

import {
  getQuickBooksTokensForCompany,
  getServiceTitanTokensForCompany,
} from "../integrations/integrationCredentialService";

let started = false;

export function startTokenRefreshCronJobs(): void {
  if (started) return;
  started = true;

  // Hourly at minute 0.
  cron.schedule("0 * * * *", async () => {
    const now = Date.now();
    const inNextHour = new Date(now + 60 * 60 * 1000);

    const expiringCreds = await prisma.integrationCredential.findMany({
      where: {
        expiresAt: {
          not: null,
          lt: inNextHour,
        },
      },
      select: {
        companyId: true,
      },
    });

    const companyIds = Array.from(
      new Set(expiringCreds.map((c) => c.companyId))
    );

    for (const companyId of companyIds) {
      try {
        // Secure refresh paths: these functions decrypt tokens, call provider refresh/access flows if expiring soon,
        // and update encrypted tokens in the DB.
        await Promise.all([
          getServiceTitanTokensForCompany(companyId).catch(() => null),
          getQuickBooksTokensForCompany(companyId).catch(() => null),
        ]);

        console.log(`[tokenRefresh] Refreshed tokens for companyId=${companyId}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `[tokenRefresh] Failed for companyId=${companyId}: ${message}`
        );
      }
    }
  });
}
