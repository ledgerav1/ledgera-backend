import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { diligenceReport } from "../services/diligenceReportEngine";

const router = Router();

router.get(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req: AuthenticatedRequest, res) => {
    const data = await diligenceReport(req.params.companyId);
    res.json(data);
  }
);

export default router;
