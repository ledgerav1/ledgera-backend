import { Router } from "express";
import { syncQuickBooksIntegration } from "../integrations/quickbooks";
import { prisma } from "../prismaClient";

const router = Router();

/**
 * POST /integrations/quickbooks/sync
 *
 * Called by the Next.js frontend after obtaining a Vercel Connect access token.
 * The frontend sends the token + companyId, and this route:
 * 1. Stores or updates the credential in the database
 * 2. Triggers an immediate data sync
 * 3. Returns the sync results
 */
router.post("/quickbooks/sync", async (req, res) => {
  try {
    const { companyId, accessToken } = req.body as {
      companyId: string;
      accessToken: string;
    };

    if (!companyId || !accessToken) {
      return res.status(400).json({ error: "Missing companyId or accessToken" });
    }

    // Vercel Connect manages the OAuth tokens, so we store a minimal credential
    // record so the backend recognizes this company as "connected".
    // The token lifecycle (refresh, etc.) is handled by Vercel Connect — we just
    // need to persist enough to identify the integration status.
    const existing = await prisma.integrationCredential.findFirst({
      where: { companyId, provider: "quickbooks" },
    });

    if (existing) {
      await prisma.integrationCredential.update({
        where: { id: existing.id },
        data: {
          // Store a placeholder since Vercel Connect manages the real token.
          // The actual access token is obtained at sync time via getToken().
          accessToken: "vercel-connect-managed",
          refreshToken: null,
          expiresAt: new Date(Date.now() + 86400 * 1000), // 24h placeholder
        },
      });
    } else {
      await prisma.integrationCredential.create({
        data: {
          companyId,
          provider: "quickbooks",
          accessToken: "vercel-connect-managed",
          refreshToken: null,
          expiresAt: new Date(Date.now() + 86400 * 1000),
        },
      });
    }

    // Sync QuickBooks data using the Vercel Connect-issued token
    // The sync function just needs the access token to call QuickBooks APIs.
    const result = await syncQuickBooksIntegration(
      {
        accessToken,
        refreshToken: "",
        expiresAt: new Date(Date.now() + 3600 * 1000),
        realmId: companyId,
      },
      companyId
    );

    return res.json({
      connected: true,
      syncResult: {
        payroll: result.payrollTruth?.synced ?? 0,
        rent: result.rent?.synced ?? 0,
        equipment: result.equipment?.synced ?? 0,
        insurance: result.insurance?.synced ?? 0,
        arAp: result.arAp,
        bankBalances: result.bankBalancesSynced ?? 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "QuickBooks sync failed";
    console.error("[integrationSync/quickbooks]", message);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /integrations/quickbooks/status/:companyId
 *
 * Returns whether a QuickBooks integration credential exists.
 */
router.get("/quickbooks/status/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;

    const cred = await prisma.integrationCredential.findFirst({
      where: { companyId, provider: "quickbooks" },
      select: { id: true },
    });

    return res.json({ connected: !!cred });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Status check failed";
    return res.status(500).json({ error: message });
  }
});

export default router;
