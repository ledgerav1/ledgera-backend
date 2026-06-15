import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./auth";

function getBodyString(req: AuthenticatedRequest, field: string): string | undefined {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Enforces that the authenticated tenant matches the companyId provided in req.body.
 * Returns 401 if unauthenticated, 400 if missing, 404 if mismatch.
 */
export function requireCompanyIdInBodyMatchAuth(field: string = "companyId") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authedCompanyId = req.user?.companyId ?? req.user?.id;
    if (!authedCompanyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const requestedCompanyId = getBodyString(req, field);
    if (!requestedCompanyId) {
      return res.status(400).json({ error: `Missing ${field}` });
    }

    if (requestedCompanyId !== authedCompanyId) {
      return res.status(404).json({ error: "Company not found" });
    }

    return next();
  };
}
