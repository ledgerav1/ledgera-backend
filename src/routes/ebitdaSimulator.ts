import { Router } from "express";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { ebitdaLiftSimulator } from "../services/ebitdaLiftSimulator";

const router = Router();

const simulatorSchema = z.object({
  fixPricing: z.boolean(),
  fixVendorCosts: z.boolean(),
  fixCollections: z.boolean(),
});

router.post(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req: AuthenticatedRequest, res) => {
    const parsed = simulatorSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const result = await ebitdaLiftSimulator(req.params.companyId, parsed.data);

    res.json(result);
  }
);

export default router;
