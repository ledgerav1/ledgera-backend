import { prisma } from "../prismaClient";

type TechnicianJob = {
  cashCollected: number;
  laborCost: number;
  materialCost: number;
  technician?: {
    name: string;
  } | null;
};

type TechnicianProductivity = {
  technician: string;
  revenue: number;
  profit: number;
  jobCount: number;
  efficiency: number;
};

export async function revenuePerTech(companyId: string): Promise<TechnicianProductivity[]> {
  const jobs = (await prisma.job.findMany({
    where: { companyId },
    include: { technician: true },
  })) as TechnicianJob[];

  const buckets = new Map<string, TechnicianProductivity>();

  for (const job of jobs) {
    const technicianName = job.technician?.name || "Unassigned";
    const profit = job.cashCollected - job.laborCost - job.materialCost;
    const existing = buckets.get(technicianName) ?? {
      technician: technicianName,
      revenue: 0,
      profit: 0,
      jobCount: 0,
      efficiency: 0,
    };

    existing.revenue += job.cashCollected;
    existing.profit += profit;
    existing.jobCount += 1;

    buckets.set(technicianName, existing);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    efficiency:
      bucket.revenue === 0 ? 0 : Number(((bucket.profit / bucket.revenue) * 100).toFixed(2)),
  }));
}
