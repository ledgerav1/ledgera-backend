import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./auth";

function getParam(req: AuthenticatedRequest, paramName: string): string | undefined {
  const v = req.params?.[paramName];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Enforces that the authenticated tenant (JWT subject) matches the tenant requested
 * via route param.
 *
 * Security behavior:
 * - If unauthenticated => 401 (handled before this middleware in most routes)
 * - If mismatch => 404 (avoid tenant existence leaks)
 */
export function requireCompanyIdMatch(paramName: string = "companyId") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authedCompanyId = req.user?.companyId ?? req.user?.id;
    if (!authedCompanyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const requestedCompanyId = getParam(req, paramName);
    if (!requestedCompanyId) {
      return res.status(400).json({ error: "Missing companyId" });
    }

    if (requestedCompanyId !== authedCompanyId) {
      return res.status(404).json({ error: "Company not found" });
    }

    return next();
  };
}
