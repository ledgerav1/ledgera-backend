import { Response, Router } from "express";
import { AuthenticatedRequest, authenticate, authorize } from "../middleware/auth";
import { getPlatformStats } from "../services/platformStats";

const router = Router();

router.get("/", authenticate, authorize("admin"), async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user?.id;
  if (!companyId) return res.status(401).json({ error: "Unauthorized" });

  const stats = await getPlatformStats(companyId);
  res.json(stats);
});

export default router;
