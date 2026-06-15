import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";
import { arAging } from "../services/arRiskEngine";
import { ebitdaForecast } from "../services/ebitdaForecast";
import { marginAnalysis } from "../services/marginEngine";
import { revenuePerTech } from "../services/productivityEngine";
import { valuationMetrics } from "../services/valuationEngine";

const router = Router();

router.get(
  "/:companyId",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  async (req, res) => {
    const { companyId } = req.params;

    const margin = await marginAnalysis(companyId);
    const techRevenue = await revenuePerTech(companyId);
    const ar = await arAging(companyId);
    const forecast = await ebitdaForecast(companyId);
    const valuation = await valuationMetrics(companyId);

    res.json({
      margin,
      techRevenue,
      ar,
      forecast,
      valuation,
    });
  }
);

export default router;
