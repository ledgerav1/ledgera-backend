import { prisma } from "../prismaClient";
import { decrypt as decryptGcm, encrypt as encryptGcm } from "../security/encryption";
import { decryptToken as decryptCbcToken, encryptToken as encryptCbcToken } from "../utils/tokenEncryption";
import type { NetSuiteOAuthTokens } from "./netsuite";
import type { AdpWorkforceNowOAuthTokens } from "./payrollProviders/adpWorkforceNow";
import type { GustoOAuthTokens } from "./payrollProviders/gusto";
import type { PaychexFlexOAuthTokens } from "./payrollProviders/paychexFlex";
import type { QuickBooksOAuthTokens } from "./quickbooks";
import { refreshQuickBooksAccessToken } from "./quickbooksOAuth";
import type { ServiceTitanOAuthTokens } from "./serviceTitan";
import { getServiceTitanAccessToken } from "./servicetitanOAuth";

const PROVIDER_SERVICE_TITAN = "servicetitan";
const PROVIDER_QUICKBOOKS = "quickbooks";
const PROVIDER_NETSUITE = "netsuite";
const PROVIDER_GUSTO = "gusto";
const PROVIDER_ADP_WORKFORCE_NOW = "adpWorkforceNow";
const PROVIDER_PAYCHEX_FLEX = "paychexFlex";

type JsonObject = Record<string, unknown>;

function assertString(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`IntegrationCredential providerContext missing/invalid ${name}`);
}

function readProviderContext(providerContext: unknown, expectedProvider: string): JsonObject {
  if (providerContext && typeof providerContext === "object") {
    return providerContext as JsonObject;
  }
  throw new Error(`IntegrationCredential providerContext missing for provider=${expectedProvider}`);
}

function requireExpiry(expiresAt: Date | null | undefined, provider: string): Date {
  if (!expiresAt) {
    throw new Error(`IntegrationCredential missing expiresAt for provider=${provider}`);
  }
  return expiresAt;
}

function isExpiringSoon(expiresAt: Date, bufferSeconds: number): boolean {
  const nowMs = Date.now();
  const expiresMs = expiresAt.getTime();
  return expiresMs - nowMs <= bufferSeconds * 1000;
}

function hasGcmFields(iv?: string | null, tag?: string | null, cipher?: string | null): boolean {
  return typeof iv === "string" && iv.length > 0 && typeof tag === "string" && tag.length > 0 && typeof cipher === "string" && cipher.length > 0;
}

function decryptAccessToken(cred: {
  accessToken: string;
  accessTokenIv?: string | null;
  accessTokenTag?: string | null;
  accessTokenCipher?: string | null;
}): string {
  if (hasGcmFields(cred.accessTokenIv, cred.accessTokenTag, cred.accessTokenCipher)) {
    return decryptGcm({
      iv: cred.accessTokenIv as string,
      tag: cred.accessTokenTag as string,
      content: cred.accessTokenCipher as string,
    });
  }
  return decryptCbcToken(cred.accessToken);
}

function decryptRefreshToken(cred: {
  refreshToken: string | null;
  refreshTokenIv?: string | null;
  refreshTokenTag?: string | null;
  refreshTokenCipher?: string | null;
}): string {
  if (!cred.refreshToken && !hasGcmFields(cred.refreshTokenIv, cred.refreshTokenTag, cred.refreshTokenCipher)) return "";

  if (hasGcmFields(cred.refreshTokenIv, cred.refreshTokenTag, cred.refreshTokenCipher)) {
    return decryptGcm({
      iv: cred.refreshTokenIv as string,
      tag: cred.refreshTokenTag as string,
      content: cred.refreshTokenCipher as string,
    });
  }

  // legacy path (CBC stored in refreshToken)
  return cred.refreshToken ? decryptCbcToken(cred.refreshToken) : "";
}

function encryptAccessTokenBoth(plainText: string) {
  const cbc = encryptCbcToken(plainText);
  const gcm = encryptGcm(plainText);
  return {
    accessToken: cbc,
    accessTokenIv: gcm.iv,
    accessTokenTag: gcm.tag,
    accessTokenCipher: gcm.content,
  };
}

function encryptRefreshTokenBoth(plainText: string) {
  const cbc = encryptCbcToken(plainText);
  const gcm = encryptGcm(plainText);
  return {
    refreshToken: cbc,
    refreshTokenIv: gcm.iv,
    refreshTokenTag: gcm.tag,
    refreshTokenCipher: gcm.content,
  };
}

export async function getServiceTitanTokensForCompany(companyId: string): Promise<ServiceTitanOAuthTokens> {
  const cred = await prisma.integrationCredential.findFirst({
    where: { companyId, provider: PROVIDER_SERVICE_TITAN },
  });

  if (!cred) {
    throw new Error(`No ServiceTitan IntegrationCredential found for companyId=${companyId}`);
  }

  const ctx = readProviderContext(cred.providerContext, PROVIDER_SERVICE_TITAN);
  const tenantId = assertString(ctx.tenantId, "tenantId");
  const expiresAt = requireExpiry(cred.expiresAt, PROVIDER_SERVICE_TITAN);

  let accessToken = decryptAccessToken(cred as any);
  let finalExpiresAt = expiresAt;

  // ServiceTitan uses client-credentials OAuth; re-request access token when expiring.
  if (isExpiringSoon(expiresAt, 60)) {
    const fresh = await getServiceTitanAccessToken();

    accessToken = fresh.accessToken;
    finalExpiresAt = fresh.expiresAt;

    const enc = encryptAccessTokenBoth(accessToken);

    await prisma.integrationCredential.update({
      where: { id: cred.id },
      data: {
        accessToken: enc.accessToken,
        accessTokenIv: enc.accessTokenIv,
        accessTokenTag: enc.accessTokenTag,
        accessTokenCipher: enc.accessTokenCipher,

        // ServiceTitan stores no refresh token.
        refreshToken: null,
        refreshTokenIv: null,
        refreshTokenTag: null,
        refreshTokenCipher: null,

        expiresAt: finalExpiresAt,
        providerContext: { tenantId },
      },
    });
  }

  return {
    accessToken,
    refreshToken: cred.refreshToken ?? "",
    expiresAt: finalExpiresAt,
    tenantId,
  };
}

export async function getQuickBooksTokensForCompany(companyId: string): Promise<QuickBooksOAuthTokens> {
  const cred = await prisma.integrationCredential.findFirst({
    where: { companyId, provider: PROVIDER_QUICKBOOKS },
  });

  if (!cred) {
    throw new Error(`No QuickBooks IntegrationCredential found for companyId=${companyId}`);
  }

  const ctx = readProviderContext(cred.providerContext, PROVIDER_QUICKBOOKS);
  const realmId = assertString(ctx.realmId, "realmId");

  const expiresAt = requireExpiry(cred.expiresAt, PROVIDER_QUICKBOOKS);

  let accessToken = decryptAccessToken(cred as any);
  let finalExpiresAt = expiresAt;
  let finalRefreshToken = decryptRefreshToken(cred as any);

  if (!finalRefreshToken) {
    throw new Error("IntegrationCredential missing refreshToken for provider=quickbooks");
  }

  if (isExpiringSoon(expiresAt, 60)) {
    const refreshed = await refreshQuickBooksAccessToken({ refreshToken: finalRefreshToken });

    accessToken = refreshed.accessToken;
    finalRefreshToken = refreshed.refreshToken;
    finalExpiresAt = refreshed.expiresAt;

    const encAccess = encryptAccessTokenBoth(accessToken);
    const encRefresh = encryptRefreshTokenBoth(finalRefreshToken);

    await prisma.integrationCredential.update({
      where: { id: cred.id },
      data: {
        accessToken: encAccess.accessToken,
        accessTokenIv: encAccess.accessTokenIv,
        accessTokenTag: encAccess.accessTokenTag,
        accessTokenCipher: encAccess.accessTokenCipher,

        refreshToken: encRefresh.refreshToken,
        refreshTokenIv: encRefresh.refreshTokenIv,
        refreshTokenTag: encRefresh.refreshTokenTag,
        refreshTokenCipher: encRefresh.refreshTokenCipher,

        expiresAt: finalExpiresAt,
        providerContext: { realmId },
      },
    });
  }

  return {
    accessToken,
    refreshToken: finalRefreshToken,
    expiresAt: finalExpiresAt,
    realmId,
  };
}

export async function getNetSuiteTokensForCompany(companyId: string): Promise<NetSuiteOAuthTokens> {
  const cred = await prisma.integrationCredential.findFirst({
    where: { companyId, provider: PROVIDER_NETSUITE },
  });

  if (!cred) {
    throw new Error(`No NetSuite IntegrationCredential found for companyId=${companyId}`);
  }

  const ctx = readProviderContext(cred.providerContext, PROVIDER_NETSUITE);
  const accountId =
    typeof ctx.accountId === "string" && ctx.accountId.trim().length > 0 ? ctx.accountId : undefined;

  const expiresAt = requireExpiry(cred.expiresAt, PROVIDER_NETSUITE);

  const accessToken = decryptAccessToken(cred as any);
  const refreshToken = decryptRefreshToken(cred as any);

  // NOTE: NetSuite token refresh is connector-specific.
  // For now we only decrypt & return stored credentials.
  return {
    accessToken,
    refreshToken,
    expiresAt,
    accountId,
  };
}

export async function getGustoTokensForCompany(companyId: string): Promise<GustoOAuthTokens> {
  const cred = await prisma.integrationCredential.findFirst({
    where: { companyId, provider: PROVIDER_GUSTO },
  });

  if (!cred) {
    throw new Error(`No Gusto IntegrationCredential found for companyId=${companyId}`);
  }

  const ctx = readProviderContext(cred.providerContext, PROVIDER_GUSTO);
  const expiresAt = requireExpiry(cred.expiresAt, PROVIDER_GUSTO);

  const accessToken = decryptAccessToken(cred as any);
  const refreshToken = decryptRefreshToken(cred as any);

  if (!refreshToken) {
    throw new Error(`Gusto IntegrationCredential missing refreshToken for companyId=${companyId}`);
  }

  const companyIdExternal =
    typeof ctx.companyIdExternal === "string" && ctx.companyIdExternal.trim().length > 0
      ? ctx.companyIdExternal
      : undefined;

  // NOTE: OAuth refresh not implemented yet for Gusto.
  return {
    accessToken,
    refreshToken,
    expiresAt,
    companyIdExternal,
  };
}

export async function getAdpWorkforceNowTokensForCompany(
  companyId: string
): Promise<AdpWorkforceNowOAuthTokens> {
  const cred = await prisma.integrationCredential.findFirst({
    where: { companyId, provider: PROVIDER_ADP_WORKFORCE_NOW },
  });

  if (!cred) {
    throw new Error(`No ADP Workforce Now IntegrationCredential found for companyId=${companyId}`);
  }

  const ctx = readProviderContext(cred.providerContext, PROVIDER_ADP_WORKFORCE_NOW);
  const expiresAt = requireExpiry(cred.expiresAt, PROVIDER_ADP_WORKFORCE_NOW);

  const accessToken = decryptAccessToken(cred as any);
  const refreshToken = decryptRefreshToken(cred as any);

  if (!refreshToken) {
    throw new Error(
      `ADP Workforce Now IntegrationCredential missing refreshToken for companyId=${companyId}`
    );
  }

  const workforceOrgId =
    typeof ctx.workforceOrgId === "string" && ctx.workforceOrgId.trim().length > 0
      ? ctx.workforceOrgId
      : undefined;

  // NOTE: OAuth refresh not implemented yet for ADP.
  return {
    accessToken,
    refreshToken,
    expiresAt,
    workforceOrgId,
  };
}

export async function getPaychexFlexTokensForCompany(
  companyId: string
): Promise<PaychexFlexOAuthTokens> {
  const cred = await prisma.integrationCredential.findFirst({
    where: { companyId, provider: PROVIDER_PAYCHEX_FLEX },
  });

  if (!cred) {
    throw new Error(`No Paychex Flex IntegrationCredential found for companyId=${companyId}`);
  }

  const ctx = readProviderContext(cred.providerContext, PROVIDER_PAYCHEX_FLEX);
  const expiresAt = requireExpiry(cred.expiresAt, PROVIDER_PAYCHEX_FLEX);

  const accessToken = decryptAccessToken(cred as any);
  const refreshToken = decryptRefreshToken(cred as any);

  if (!refreshToken) {
    throw new Error(`Paychex Flex IntegrationCredential missing refreshToken for companyId=${companyId}`);
  }

  const paychexAccountId =
    typeof ctx.paychexAccountId === "string" && ctx.paychexAccountId.trim().length > 0
      ? ctx.paychexAccountId
      : undefined;

  // NOTE: OAuth refresh not implemented yet for Paychex.
  return {
    accessToken,
    refreshToken,
    expiresAt,
    paychexAccountId,
  };
}
