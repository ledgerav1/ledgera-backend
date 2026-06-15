import { Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthenticatedRequest } from "../middleware/auth";
import { prisma } from "../prismaClient";
import { getPlatformStats } from "../services/platformStats";

export const platformStats = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.id;
    if (!companyId) return res.status(401).json({ error: "Unauthorized" });

    const [companies, jobs, invoices, payments, contracts] = await Promise.all([
      prisma.company.count({ where: { id: companyId } }),
      prisma.job.count({ where: { companyId } }),
      prisma.invoice.count({ where: { companyId } }),
      prisma.payment.count({ where: { companyId } }),
      prisma.contract.count({ where: { companyId } }),
    ]);

    const platformMetrics = await getPlatformStats(companyId);

    res.json({
      companies,
      jobs,
      invoices,
      payments,
      contracts,
      ...platformMetrics,
    });
  }
);
