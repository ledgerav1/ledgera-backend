import { prisma } from "../prismaClient";

type MarginBucket = {
  revenue: number;
  profit: number;
  margin: number;
};

type JobRecord = {
  cashCollected: number;
  laborCost: number;
  materialCost: number;
  serviceType?: {
    name: string;
  } | null;
};

export async function marginAnalysis(companyId: string): Promise<Record<string, MarginBucket>> {
  const jobs = (await prisma.job.findMany({
    where: { companyId },
    include: { serviceType: true },
  })) as JobRecord[];

  const serviceMargins: Record<string, MarginBucket> = {};

  for (const job of jobs) {
    const grossProfit = job.cashCollected - job.laborCost - job.materialCost;
    const margin = job.cashCollected === 0 ? 0 : grossProfit / job.cashCollected;

    const service = job.serviceType?.name || "Unknown";

    if (!serviceMargins[service]) {
      serviceMargins[service] = { revenue: 0, profit: 0, margin: 0 };
    }

    serviceMargins[service].revenue += job.cashCollected;
    serviceMargins[service].profit += grossProfit;
  }

  for (const service of Object.keys(serviceMargins)) {
    const bucket = serviceMargins[service];
    bucket.margin = bucket.revenue === 0 ? 0 : bucket.profit / bucket.revenue;
  }

  return serviceMargins;
}
