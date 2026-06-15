import { prisma } from "../prismaClient";

export async function profitByService(companyId: string): Promise<Record<string, number>> {
  const jobs = await prisma.job.findMany({
    where: { companyId },
  });

  const totals: Record<string, number> = {};

  for (const job of jobs) {
    if (!job.serviceTypeId) {
      continue;
    }

    const profit = job.cashCollected - job.laborCost - job.materialCost;
    totals[job.serviceTypeId] = (totals[job.serviceTypeId] ?? 0) + profit;
  }

  return totals;
}
