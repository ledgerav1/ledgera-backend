import { Router } from "express";
import { platformStats } from "../controllers/admin.controller";
import { triggerRestoreTest } from "../controllers/backup.controller";
import { authMiddleware, requireRole } from "../middleware/auth";

const router = Router();

router.get("/stats", authMiddleware, requireRole("admin"), platformStats);

router.post(
  "/restore-test",
  authMiddleware,
  requireRole("admin"),
  async (req, res, next) => {
    return triggerRestoreTest(req, res, next);
  }
);

export default router;
