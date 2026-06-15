import jwt, { JwtPayload } from "jsonwebtoken";
import { GoTrueClient } from "@supabase/auth-js";
import { NextFunction, Request, Response } from "express";
import { logAccess } from "./auditLogger";

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const supabaseAuth =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? new GoTrueClient({
        url: `${SUPABASE_URL}/auth/v1`,
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        storageKey: "ledgera-server-auth",
        // Keep this strictly server-side: no persistence, no auto-refresh.
        persistSession: false,
        autoRefreshToken: false,
        skipAutoInitialize: true,
        // Avoid noisy debug logs in production.
        debug: false,
      })
    : null;

export interface AuthenticatedRequest extends Request {
  user?: {
    /**
     * Legacy compatibility:
     * - legacy JWT uses `sub = companyId`, so historically `user.id` was used as companyId.
     * - keep it for backwards-compat.
     */
    id?: string;

    /** Actual authenticated user id (present in our legacy JWT as `userId`). */
    userId?: string;

    /** Tenant/company id used for all tenant-scoped data. */
    companyId?: string;

    email?: string;
    role?: string;
  };
}

interface TokenPayload extends JwtPayload {
  sub?: string;
  email?: string;
  role?: string;

  // Legacy Ledgera JWT payload (see routes/auth.ts issueAuthToken())
  companyId?: string;
  userId?: string;
}

function getSensitive(reqPath: string): boolean {
  const sensitivePrefixes = [
    "/acquisition",
    "/contracts/firma",
    "/invoices",
    "/payments",
    "/analytics",
    "/integrations",
    "/jobs",
    "/executive",
  ];
  return sensitivePrefixes.some((p) => reqPath.startsWith(p));
}

function getStringClaim(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();

  const reqPath = req.path ?? "";
  const isSensitive = getSensitive(reqPath);

  // 1) Prefer Supabase JWKS verification (if configured)
  if (supabaseAuth) {
    try {
      const claimsRes = await supabaseAuth.getClaims(token);

      if (claimsRes.data?.claims) {
        const claims = claimsRes.data.claims as unknown as TokenPayload;
        const rawClaims = claims as unknown as Record<string, unknown>;

        const companyIdFromClaims = getStringClaim(rawClaims, [
          "companyId",
          "company_id",
          "tenantId",
          "tenant_id",
          "company",
        ]);

        const userIdFromClaims = getStringClaim(rawClaims, ["userId", "user_id", "subUserId"]);

        const sub = typeof claims.sub === "string" ? claims.sub : undefined;

        // For Supabase, `sub` is typically the user id; we keep it as legacy `id` only.
        // CompanyId should ideally come from dedicated claims; if absent we fall back to `sub`.
        const companyId = companyIdFromClaims ?? sub;
        const userId = userIdFromClaims ?? sub;

        req.user = {
          id: sub,
          userId,
          companyId,
          email: typeof claims.email === "string" ? claims.email : undefined,
          role: typeof claims.role === "string" ? claims.role : undefined,
        };

        if (isSensitive && userId && req.user?.companyId) {
          await logAccess(userId, req.method, reqPath, req.user.companyId);
        }

        return next();
      }
    } catch {
      // fall through to legacy JWT_SECRET verification
    }
  }

  // 2) Legacy verification fallback (shared secret)
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string, {
      algorithms: ["HS256"],
    }) as TokenPayload;

    const sub = typeof decoded.sub === "string" ? decoded.sub : undefined;

    // In our legacy JWT, `sub = companyId`, and we also include `companyId` + `userId`.
    const companyId = decoded.companyId ?? sub;
    const userId = decoded.userId;

    req.user = {
      // keep legacy shape: id is companyId (since sub is companyId in legacy JWT)
      id: sub,
      userId,
      companyId,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      role: typeof decoded.role === "string" ? decoded.role : undefined,
    };

    if (isSensitive && userId && companyId) {
      await logAccess(userId, req.method, reqPath, companyId);
    }

    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export const authenticate = authMiddleware;

export function requireRole(requiredRole: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}

export const authorize = requireRole;
