import axios from "axios";

type ServiceTitanTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type ServiceTitanAccessTokenResult = {
  accessToken: string;
  expiresAt: Date;
};

function requireEnv(key: string): string {
  const v = process.env[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  throw new Error(`Missing environment variable ${key}`);
}

export async function getServiceTitanAccessToken(): Promise<ServiceTitanAccessTokenResult> {
  const clientId = requireEnv("SERVICETITAN_CLIENT_ID");
  const clientSecret = requireEnv("SERVICETITAN_CLIENT_SECRET");

  const response = await axios.post<ServiceTitanTokenResponse>(
    "https://auth.servicetitan.io/connect/token",
    new URLSearchParams({
      grant_type: "client_credentials",
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

  const accessToken = response.data.access_token;
  if (!accessToken) {
    throw new Error("ServiceTitan OAuth token response missing access_token");
  }

  const expiresInSeconds = typeof response.data.expires_in === "number" ? response.data.expires_in : 900;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return { accessToken, expiresAt };
}
