import { prisma } from "../prismaClient";

export async function profitByTechnician(companyId: string): Promise<Record<string, number>> {
  const jobs = await prisma.job.findMany({
    where: { companyId },
  });

  const totals: Record<string, number> = {};

  for (const job of jobs) {
    if (!job.technicianId) {
      continue;
    }

    const profit = job.cashCollected - job.laborCost - job.materialCost;
    totals[job.technicianId] = (totals[job.technicianId] ?? 0) + profit;
  }

  return totals;
}
