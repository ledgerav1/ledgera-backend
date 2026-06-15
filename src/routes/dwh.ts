import { Router } from "express";
import { materializeDatasetV1 } from "../controllers/dwh.controller";
import { authenticate } from "../middleware/auth";
import { requireCompanyIdMatch } from "../middleware/tenantCompanyAccess";
import { tenantContextMiddleware } from "../middleware/tenantContextMiddleware";

const router = Router();

router.post(
  "/:companyId/dataset_v1/materialize",
  authenticate,
  tenantContextMiddleware,
  requireCompanyIdMatch("companyId"),
  materializeDatasetV1
);

export default router;
