import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";

import {
  arRisk,
  cashFlow,
  ebitda,
  leakageScore,
  partsLeakageScore,
  serviceProfit,
  techProfit,
  techEfficiency,
  callMetrics,
  marginInsights,
  profitAlerts,
  dashboardMetrics,
} from "../controllers/analytics.controller";

const router = Router();

router.get(
  "/:companyId/margin-insights",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  marginInsights
);

router.get(
  "/:companyId/profit-alerts",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  profitAlerts
);

router.get(
  "/:companyId/cash-flow",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  cashFlow
);

router.get(
  "/:companyId/technician-profit",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  techProfit
);

router.get(
  "/:companyId/technician-efficiency",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  techEfficiency
);

router.get(
  "/:companyId/service-profit",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  serviceProfit
);

router.get(
  "/:companyId/leakage-score",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  leakageScore
);

router.get(
  "/:companyId/parts-leakage-score",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  partsLeakageScore
);

router.get(
  "/:companyId/ar-aging",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  arRisk
);

router.get(
  "/:companyId/ebitda-forecast",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  ebitda
);

router.get(
  "/:companyId/call-metrics",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  callMetrics
);

router.get(
  "/:companyId/dashboard-metrics",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  dashboardMetrics
);

export default router;
