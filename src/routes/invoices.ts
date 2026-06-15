import { Response, Router } from "express";
import { AuthenticatedRequest, authenticate } from "../middleware/auth";
import { prisma } from "../prismaClient";

const router = Router();

router.get("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.id;
    if (!companyId) return res.status(401).json({ error: "Unauthorized" });

    const invoices = await prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.get("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.id;
    if (!companyId) return res.status(401).json({ error: "Unauthorized" });

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId },
    });

    res.json(invoice || { error: "Invoice not found" });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

export default router;
