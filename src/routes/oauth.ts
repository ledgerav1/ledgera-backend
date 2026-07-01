import axios from "axios";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import { syncQuickBooksIntegration } from "../integrations/quickbooks";
import { prisma } from "../prismaClient";
import { encrypt as encryptGcm } from "../security/encryption";
import { encryptToken } from "../utils/tokenEncryption";

const router = Router();

const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OAuth callback attempts, please try again later" },
});

function requireEnv(key: string): string {
  const v = process.env[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  throw new Error(`Missing environment variable ${key}`);
}

function asString(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`Missing/invalid ${name}`);
}

function oauthStateSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

type ServiceTitanOAuthStatePayload = {
  purpose: "servicetitan_oauth_connect";
  companyId: string;
};

function signServiceTitanOAuthState(payload: ServiceTitanOAuthStatePayload): string {
  return jwt.sign(payload, oauthStateSecret(), {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

function verifyServiceTitanOAuthState(state: string): ServiceTitanOAuthStatePayload {
  try {
    const decoded = jwt.verify(state, oauthStateSecret(), {
      algorithms: ["HS256"],
    }) as ServiceTitanOAuthStatePayload;

    if (!decoded || decoded.purpose !== "servicetitan_oauth_connect") {
      throw new Error("Invalid OAuth state");
    }

    if (typeof decoded.companyId !== "string" || decoded.companyId.trim().length === 0) {
      throw new Error("Invalid OAuth state");
    }

    return decoded;
  } catch {
    throw new Error("Invalid OAuth state");
  }
}

type ServiceTitanAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  // Depending on ServiceTitan’s response shape, one of these may exist:
  tenant_id?: string;
  tenantId?: string;
};

async function upsertServiceTitanCredential(params: {
  companyId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date;
  tenantId: string;
}) {
  const existing = await prisma.integrationCredential.findFirst({
    where: { companyId: params.companyId, provider: "servicetitan" },
  });

  const providerContext = { tenantId: params.tenantId };

  const accessTokenCbc = encryptToken(params.accessToken);
  const accessTokenGcm = encryptGcm(params.accessToken);

  const refreshTokenCbc = params.refreshToken ? encryptToken(params.refreshToken) : null;
  const refreshTokenGcm = params.refreshToken ? encryptGcm(params.refreshToken) : null;

  const data = {
    accessToken: accessTokenCbc,
    accessTokenIv: accessTokenGcm.iv,
    accessTokenTag: accessTokenGcm.tag,
    accessTokenCipher: accessTokenGcm.content,

    refreshToken: refreshTokenCbc,
    refreshTokenIv: refreshTokenGcm?.iv ?? null,
    refreshTokenTag: refreshTokenGcm?.tag ?? null,
    refreshTokenCipher: refreshTokenGcm?.content ?? null,

    expiresAt: params.expiresAt,
    providerContext,
  };

  if (existing) {
    await prisma.integrationCredential.update({
      where: { id: existing.id },
      data,
    });
    return existing.id;
  }

  const created = await prisma.integrationCredential.create({
    data: {
      companyId: params.companyId,
      provider: "servicetitan",
      ...data,
    },
  });

  return created.id;
}

/**
 * ServiceTitan "connect"
 * Redirects the user to ServiceTitan’s authorization endpoint.
 *
 * This route sets signed `state` so the callback can store credentials securely.
 */
router.get("/servicetitan/connect/:companyId", (req, res) => {
  const companyId = asString(req.params.companyId, "companyId");

  const clientId = requireEnv("SERVICETITAN_CLIENT_ID");
  const redirectUri = requireEnv("SERVICETITAN_REDIRECT_URI");

  const state = signServiceTitanOAuthState({
    purpose: "servicetitan_oauth_connect",
    companyId,
  });

  const url = `https://auth.servicetitan.io/connect/authorize?response_type=code&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=jobs.read&state=${encodeURIComponent(
    state
  )}`;

  res.redirect(url);
});

/**
 * ServiceTitan OAuth callback
 * Exchanges the authorization code for tokens and stores them.
 *
 * Note: ServiceTitan will call this endpoint without our auth middleware.
 */
router.get("/servicetitan/callback", oauthCallbackLimiter, async (req, res) => {
  try {
    const code = asString(req.query.code, "code");
    const stateRaw = asString(req.query.state, "state");
    const state = verifyServiceTitanOAuthState(stateRaw);
    const companyId = state.companyId;

    const clientId = requireEnv("SERVICETITAN_CLIENT_ID");
    const clientSecret = requireEnv("SERVICETITAN_CLIENT_SECRET");
    const redirectUri = requireEnv("SERVICETITAN_REDIRECT_URI");

    const tokenResponse = await axios.post<ServiceTitanAuthTokenResponse>(
      "https://auth.servicetitan.io/connect/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 15000,
      }
    );

    const data = tokenResponse.data;

    const accessToken = data.access_token;
    if (!accessToken) {
      return res.status(400).send("ServiceTitan token response missing access_token");
    }

    const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 0;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const tenantId = (data.tenant_id ?? data.tenantId) ? String(data.tenant_id ?? data.tenantId) : "";
    if (!tenantId) {
      return res
        .status(400)
        .send("ServiceTitan token response missing tenant_id/tenantId (needed for x-tenant-id)");
    }

    await upsertServiceTitanCredential({
      companyId,
      accessToken,
      refreshToken: data.refresh_token ?? null,
      expiresAt,
      tenantId,
    });

    return res.send("Connected to ServiceTitan");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ServiceTitan OAuth callback failed";
    return res.status(400).send(message);
  }
});

// ─── QuickBooks OAuth ────────────────────────────────────────────────────────
//
// QuickBooks OAuth uses Intuit's OAuth 2.0 flow.
// We define the connect and callback endpoints here for consistency.
// The QuickBooks OAuth library has token exchange helpers in
// integrations/quickbooksOAuth.ts (used server-to-server).
// The user-facing redirect and callback are handled here.

type QuickBooksOAuthStatePayload = {
  purpose: "quickbooks_oauth_connect";
  companyId: string;
};

function signQuickBooksOAuthState(payload: QuickBooksOAuthStatePayload): string {
  return jwt.sign(payload, oauthStateSecret(), {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

function verifyQuickBooksOAuthState(state: string): QuickBooksOAuthStatePayload {
  try {
    const decoded = jwt.verify(state, oauthStateSecret(), {
      algorithms: ["HS256"],
    }) as QuickBooksOAuthStatePayload;

    if (!decoded || decoded.purpose !== "quickbooks_oauth_connect") {
      throw new Error("Invalid OAuth state");
    }

    if (typeof decoded.companyId !== "string" || decoded.companyId.trim().length === 0) {
      throw new Error("Invalid OAuth state");
    }

    return decoded;
  } catch {
    throw new Error("Invalid OAuth state");
  }
}

router.get("/quickbooks/connect/:companyId", (req, res) => {
  const companyId = asString(req.params.companyId, "companyId");

  const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
  const redirectUri = requireEnv("QUICKBOOKS_REDIRECT_URI");
  const scope = process.env.QUICKBOOKS_SCOPE || "com.intuit.quickbooks.accounting";

  const state = signQuickBooksOAuthState({
    purpose: "quickbooks_oauth_connect",
    companyId,
  });

  const url = `https://appcenter.intuit.com/connect/oauth2?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
    scope
  )}&state=${encodeURIComponent(state)}`;

  res.redirect(url);
});

router.get("/quickbooks/callback", oauthCallbackLimiter, async (req, res) => {
  try {
    const code = asString(req.query.code, "code");
    const realmId = req.query.realmId ? String(req.query.realmId) : "";
    const stateRaw = asString(req.query.state, "state");
    const state = verifyQuickBooksOAuthState(stateRaw);
    const companyId = state.companyId;

    const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
    const clientSecret = requireEnv("QUICKBOOKS_CLIENT_SECRET");
    const redirectUri = requireEnv("QUICKBOOKS_REDIRECT_URI");

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    }>(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );

    const data = tokenResponse.data;

    if (!data.access_token) {
      return res.status(400).send("QuickBooks token response missing access_token");
    }
    if (!data.refresh_token) {
      return res.status(400).send("QuickBooks token response missing refresh_token");
    }

    const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // Store the QuickBooks credentials
    const existing = await prisma.integrationCredential.findFirst({
      where: { companyId, provider: "quickbooks" },
    });

    const providerContext = realmId ? { realmId } : {};

    const accessTokenCbc = encryptToken(data.access_token);
    const accessTokenGcm = encryptGcm(data.access_token);
    const refreshTokenCbc = encryptToken(data.refresh_token);
    const refreshTokenGcm = encryptGcm(data.refresh_token);

    const credentialData = {
      accessToken: accessTokenCbc,
      accessTokenIv: accessTokenGcm.iv,
      accessTokenTag: accessTokenGcm.tag,
      accessTokenCipher: accessTokenGcm.content,
      refreshToken: refreshTokenCbc,
      refreshTokenIv: refreshTokenGcm.iv,
      refreshTokenTag: refreshTokenGcm.tag,
      refreshTokenCipher: refreshTokenGcm.content,
      expiresAt,
      providerContext,
    };

    if (existing) {
      await prisma.integrationCredential.update({
        where: { id: existing.id },
        data: credentialData,
      });
    } else {
      await prisma.integrationCredential.create({
        data: {
          companyId,
          provider: "quickbooks",
          ...credentialData,
        },
      });
    }

    // Immediate data sync — client sees dashboard populated right away
    try {
      const tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        realmId,
      };
      await syncQuickBooksIntegration(tokens, companyId);
      console.log(`[quickbooks/callback] Initial sync complete for companyId=${companyId}`);
    } catch (syncErr: unknown) {
      const syncMsg = syncErr instanceof Error ? syncErr.message : "Sync failed";
      console.error(`[quickbooks/callback] Initial sync error for companyId=${companyId}: ${syncMsg}`);
      // Non-fatal — credentials are stored; next cron sync will retry.
    }

    const appUrl = process.env.APP_URL || "https://ledgerahq.com";
    return res.redirect(`${appUrl}/integrations?connected=quickbooks`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "QuickBooks OAuth callback failed";
    return res.status(400).send(message);
  }
});

export default router;
