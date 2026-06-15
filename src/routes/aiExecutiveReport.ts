import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { generateExecutiveReport } from "../services/aiExecutiveReport";

const router = Router();

/**
 * 🤖 AI DAILY EXECUTIVE REPORT
 * GET /ai/executive-report/:companyId
 */
router.get(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req: AuthenticatedRequest, res) => {
    const { companyId } = req.params;
    const report = await generateExecutiveReport(companyId);
    res.json({ companyId, report });
  }
);

export default router;
