import { Response, Router } from "express";
import { AuthenticatedRequest, authenticate } from "../middleware/auth";
import { prisma } from "../prismaClient";

const router = Router();

router.get("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.id;
    if (!companyId) return res.status(401).json({ error: "Unauthorized" });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    res.json(company ? [company] : []);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

router.get("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.id;
    if (!companyId) return res.status(401).json({ error: "Unauthorized" });

    const requestedCompanyId = String(req.params.id);
    if (requestedCompanyId !== companyId) {
      return res.status(404).json({ error: "Company not found" });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    res.json(company || { error: "Company not found" });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

export default router;
