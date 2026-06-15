import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { acquisitionScore } from "../services/acquisitionScoreEngine";

const router = Router();

router.get(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req, res) => {
    res.json(await acquisitionScore(req.params.companyId));
  }
);

export default router;
