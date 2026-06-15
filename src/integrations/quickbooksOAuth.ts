import axios from "axios";

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  realmId?: string;
};

type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  realmId: string;
};

function requireEnv(key: string): string {
  const v = process.env[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  throw new Error(`Missing environment variable ${key}`);
}

function toExpiresAt(expiresIn: number | undefined): Date {
  const seconds = typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return new Date(Date.now() + seconds * 1000);
}

export function buildQuickBooksAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}): string {
  const baseUrl = "https://appcenter.intuit.com/connect/oauth2";
  const url = new URL(baseUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
}): Promise<OAuthTokens> {
  const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
  const clientSecret = requireEnv("QUICKBOOKS_CLIENT_SECRET");

  const response = await axios.post<QuickBooksTokenResponse>(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    }
  );

  const accessToken = response.data.access_token;
  const refreshToken = response.data.refresh_token;
  const expiresAt = toExpiresAt(response.data.expires_in);
  const realmId = response.data.realmId ?? "";

  if (!accessToken) throw new Error("QuickBooks token response missing access_token");
  if (!refreshToken) throw new Error("QuickBooks token response missing refresh_token");
  if (!realmId) throw new Error("QuickBooks token response missing realmId");

  return { accessToken, refreshToken, expiresAt, realmId };
}

export async function refreshQuickBooksAccessToken(params: {
  refreshToken: string;
}): Promise<Pick<OAuthTokens, "accessToken" | "refreshToken" | "expiresAt">> {
  const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
  const clientSecret = requireEnv("QUICKBOOKS_CLIENT_SECRET");

  const response = await axios.post<QuickBooksTokenResponse>(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    }
  );

  const accessToken = response.data.access_token;
  const refreshToken = response.data.refresh_token ?? params.refreshToken;
  const expiresAt = toExpiresAt(response.data.expires_in);

  if (!accessToken) throw new Error("QuickBooks refresh response missing access_token");
  if (!refreshToken) throw new Error("QuickBooks refresh response missing refresh_token");

  return { accessToken, refreshToken, expiresAt };
}
