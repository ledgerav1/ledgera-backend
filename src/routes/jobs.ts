import { Request, Response, Router } from "express";
import { AuthenticatedRequest, authenticate } from "../middleware/auth";
import { prisma } from "../prismaClient";

const router = Router();

router.get("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.id;
    if (!companyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const jobs = await prisma.job.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        technician: { select: { id: true, name: true } },
        serviceType: { select: { name: true } },
      },
    });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.get("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.id;
    if (!companyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const job = await prisma.job.findFirst({
      where: { id: req.params.id, companyId },
      include: {
        technician: { select: { id: true, name: true } },
        serviceType: { select: { name: true } },
      },
    });

    res.json(job || { error: "Job not found" });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

export default router;
