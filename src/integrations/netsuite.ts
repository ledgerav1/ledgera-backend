export type NetSuiteOAuthTokens = {
  /**
   * Access token / OAuth bearer token or token-based credential,
   * depending on how you store NetSuite auth material.
   */
  accessToken: string;

  /**
   * Optional refresh token (may be null/empty depending on auth method).
   */
  refreshToken: string;

  /**
   * Access-token expiry (required by the integration credential row).
   */
  expiresAt: Date;

  /**
   * Provider-specific identifier(s), stored in `IntegrationCredential.providerContext`.
   * Keep optional to avoid breaking existing/new rows.
   */
  accountId?: string;
};
