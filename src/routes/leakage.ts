import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { logAudit } from "../services/auditLogger";
import { calculateLeakageScore } from "../services/leakageScoreEngine";

const router = Router();

router.get(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await calculateLeakageScore(req.params.companyId);

      if (req.user?.id) {
        logAudit("VIEWED_LEAKAGE_SCORE", req.user.id);
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Leakage calculation failed" });
    }
  }
);

export default router;
