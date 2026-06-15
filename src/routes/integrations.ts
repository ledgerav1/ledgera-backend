import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import { getServiceTitanAccessToken } from "../integrations/servicetitanOAuth";
import { authenticate, authorize, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { prisma } from "../prismaClient";
import { encrypt as encryptGcm } from "../security/encryption";
import { encryptToken } from "../utils/tokenEncryption";

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

import {
  buildQuickBooksAuthorizationUrl,
  exchangeAuthorizationCode,
} from "../integrations/quickbooksOAuth";

const router = Router();

const quickbooksCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OAuth callback attempts, please try again later" },
});

type IntegrationProvider = "servicetitan" | "quickbooks" | "gusto" | "adpWorkforceNow" | "paychexFlex";

function parseProvider(value: unknown): IntegrationProvider {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "servicetitan" || v === "quickbooks") return v;
  if (v === "gusto") return "gusto";
  if (v === "adpworkforcenow") return "adpWorkforceNow";
  if (v === "paychexflex") return "paychexFlex";
  throw new Error("Invalid provider");
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  throw new Error(`Missing environment variable ${key}`);
}

function oauthStateSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

type OAuthStatePayload = {
  provider: IntegrationProvider;
  companyId: string;
  purpose: "quickbooks_oauth_connect";
};

function signOAuthState(payload: OAuthStatePayload): string {
  return jwt.sign(payload, oauthStateSecret(), {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

function verifyOAuthState(state: string): OAuthStatePayload {
  const decoded = jwt.verify(state, oauthStateSecret(), {
    algorithms: ["HS256"],
  }) as OAuthStatePayload;

  if (!decoded || decoded.purpose !== "quickbooks_oauth_connect") {
    throw new Error("Invalid OAuth state");
  }

  return decoded;
}

function getRequestBaseUrl(req: AuthenticatedRequest | any): string {
  const protocol = req.protocol ?? "http";
  const host = req.get?.("host");
  if (!host) return `${protocol}://localhost`;
  return `${protocol}://${host}`;
}

router.post(
  "/:companyId/sync",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  authorize("admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const companyId = req.params.companyId;
      const provider = parseProvider(req.body?.provider);

      if (provider === "servicetitan") {
        const tokens = await getServiceTitanTokensForCompany(companyId);
        const result = await syncServiceTitanAndRefresh(tokens, companyId);
        return res.json(result);
      }

      if (provider === "quickbooks") {
        const tokens = await getQuickBooksTokensForCompany(companyId);
        const result = await syncQuickBooksAndRefresh(tokens, companyId);
        return res.json(result);
      }

      if (provider === "gusto") {
        const tokens = await getGustoTokensForCompany(companyId);
        const result = await syncPayrollAndRefresh({ provider: "gusto", tokens }, companyId);
        return res.json(result);
      }

      if (provider === "adpWorkforceNow") {
        const tokens = await getAdpWorkforceNowTokensForCompany(companyId);
        const result = await syncPayrollAndRefresh(
          { provider: "adpWorkforceNow", tokens },
          companyId
        );
        return res.json(result);
      }

      // paychexFlex
      const tokens = await getPaychexFlexTokensForCompany(companyId);
      const result = await syncPayrollAndRefresh(
        { provider: "paychexFlex", tokens },
        companyId
      );
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Integration sync failed";
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * ServiceTitan "connect"
 * - No user OAuth consent is required (client credentials OAuth).
 * - We store tenantId + initial access token/expiry.
 */
router.post(
  "/:companyId/servicetitan/connect",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  authorize("admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const companyId = req.params.companyId;
      const tenantId = String(req.body?.tenantId ?? "");
      if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

      const { accessToken, expiresAt } = await getServiceTitanAccessToken();
      const accessTokenGcm = encryptGcm(accessToken);

      const existing = await prisma.integrationCredential.findFirst({
        where: { companyId, provider: "servicetitan" },
      });

      const cred = existing
        ? await prisma.integrationCredential.update({
            where: { id: existing.id },
            data: {
              accessToken: encryptToken(accessToken),
              accessTokenIv: accessTokenGcm.iv,
              accessTokenTag: accessTokenGcm.tag,
              accessTokenCipher: accessTokenGcm.content,

              refreshToken: null,
              refreshTokenIv: null,
              refreshTokenTag: null,
              refreshTokenCipher: null,

              expiresAt,
              providerContext: { tenantId },
            },
          })
        : await prisma.integrationCredential.create({
            data: {
              companyId,
              provider: "servicetitan",
              accessToken: encryptToken(accessToken),
              accessTokenIv: accessTokenGcm.iv,
              accessTokenTag: accessTokenGcm.tag,
              accessTokenCipher: accessTokenGcm.content,

              refreshToken: null,
              refreshTokenIv: null,
              refreshTokenTag: null,
              refreshTokenCipher: null,

              expiresAt,
              providerContext: { tenantId },
            },
          });

      return res.json({ ok: true, credentialId: cred.id, expiresAt });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "ServiceTitan connect failed";
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * QuickBooks "connect"
 * Returns an Intuit authorization URL.
 */
router.post(
  "/:companyId/servicetitan/connect",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  authorize("admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const companyId = req.params.companyId;

      const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
      const redirectUri =
        process.env.QUICKBOOKS_REDIRECT_URI ??
        `${getRequestBaseUrl(req)}/integrations/${companyId}/quickbooks/callback`;

      const scope = process.env.QUICKBOOKS_SCOPE ?? "com.intuit.quickbooks.accounting";

      const state = signOAuthState({
        provider: "quickbooks",
        companyId,
        purpose: "quickbooks_oauth_connect",
      });

      const url = buildQuickBooksAuthorizationUrl({
        clientId,
        redirectUri,
        scope,
        state,
      });

      return res.json({ url, state });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "QuickBooks connect failed";
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * QuickBooks OAuth callback
 * Exchanges code -> tokens and stores IntegrationCredential.
 *
 * Note: Intuit will call this endpoint without our JWT auth.
 */
router.get(
  "/:companyId/quickbooks/callback",
  async (req, res) => {
    try {
      const companyId = req.params.companyId;
      const code = String(req.query.code ?? "");
      const stateRaw = String(req.query.state ?? "");

      if (!code) return res.status(400).json({ error: "Missing code" });
      if (!stateRaw) return res.status(400).json({ error: "Missing state" });

      const state = verifyOAuthState(stateRaw);
      if (state.companyId !== companyId) {
        return res.status(400).json({ error: "State companyId mismatch" });
      }

      const redirectUri =
        process.env.QUICKBOOKS_REDIRECT_URI ??
        `${getRequestBaseUrl(req)}/integrations/${companyId}/quickbooks/callback`;

      const { accessToken, refreshToken, expiresAt, realmId } =
        await exchangeAuthorizationCode({
          code,
          redirectUri,
        });

      const accessTokenGcm = encryptGcm(accessToken);
      const refreshTokenGcm = encryptGcm(refreshToken);

      const existing = await prisma.integrationCredential.findFirst({
        where: { companyId, provider: "quickbooks" },
      });

      const cred = existing
        ? await prisma.integrationCredential.update({
            where: { id: existing.id },
            data: {
              accessToken: encryptToken(accessToken),
              accessTokenIv: accessTokenGcm.iv,
              accessTokenTag: accessTokenGcm.tag,
              accessTokenCipher: accessTokenGcm.content,

              refreshToken: encryptToken(refreshToken),
              refreshTokenIv: refreshTokenGcm.iv,
              refreshTokenTag: refreshTokenGcm.tag,
              refreshTokenCipher: refreshTokenGcm.content,

              expiresAt,
              providerContext: { realmId },
            },
          })
        : await prisma.integrationCredential.create({
            data: {
              companyId,
              provider: "quickbooks",

              accessToken: encryptToken(accessToken),
              accessTokenIv: accessTokenGcm.iv,
              accessTokenTag: accessTokenGcm.tag,
              accessTokenCipher: accessTokenGcm.content,

              refreshToken: encryptToken(refreshToken),
              refreshTokenIv: refreshTokenGcm.iv,
              refreshTokenTag: refreshTokenGcm.tag,
              refreshTokenCipher: refreshTokenGcm.content,

              expiresAt,
              providerContext: { realmId },
            },
          });

      return res.json({ ok: true, credentialId: cred.id, realmId, expiresAt });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "QuickBooks OAuth callback failed";
      return res.status(400).json({ error: message });
    }
  }
);

export default router;
