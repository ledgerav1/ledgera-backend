import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { ebitdaLiftSimulator } from "../services/ebitdaLiftSimulator";

const router = Router();

router.post(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req, res) => {
    const data = await ebitdaLiftSimulator(req.params.companyId, req.body ?? {});
    res.json(data);
  }
);

export default router;
