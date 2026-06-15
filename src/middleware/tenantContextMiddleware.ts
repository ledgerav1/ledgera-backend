import { NextFunction, Response } from "express";
import { runWithCompanyId } from "../tenantContext";
import { AuthenticatedRequest } from "./auth";

export function tenantContextMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const companyIdFromParam =
    typeof req.params?.companyId === "string" ? req.params.companyId : undefined;

  // Institutional grade: tenant context must come from the tenant/company claim,
  // not from userId. Keep legacy fallback for older tokens.
  const companyIdFromAuth = req.user?.companyId ?? req.user?.id;

  const companyId = companyIdFromParam ?? companyIdFromAuth;

  if (!companyId) {
    // No tenant context available; don't block here.
    // Prisma middleware will enforce scoping for tenant-scoped models.
    return next();
  }

  return runWithCompanyId(companyId, () => next());
}
