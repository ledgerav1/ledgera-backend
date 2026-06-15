import { prisma } from "../prismaClient";

type JobRecord = {
  cashCollected: number;
  laborCost: number;
  materialCost: number;
};

type Totals = {
  revenue: number;
  costs: number;
};

export async function pricingEngine(companyId: string): Promise<{
  averageMargin: number;
  recommendedMonthlyFee: number;
  recommendedSetupFee: number;
}> {
  const jobs = (await prisma.job.findMany({ where: { companyId } })) as JobRecord[];

  if (jobs.length === 0) {
    return {
      averageMargin: 0,
      recommendedMonthlyFee: 0,
      recommendedSetupFee: 0,
    };
  }

  const totals = jobs.reduce<Totals>(
    (acc: Totals, job: JobRecord) => {
      acc.revenue += job.cashCollected;
      acc.costs += job.laborCost + job.materialCost;
      return acc;
    },
    { revenue: 0, costs: 0 }
  );

  const averageMargin =
    totals.revenue === 0 ? 0 : Number((((totals.revenue - totals.costs) / totals.revenue) * 100).toFixed(2));

  const recommendedMonthlyFee = Number((Math.max(totals.revenue * 0.12, 1250)).toFixed(2));
  const recommendedSetupFee = Number((Math.max(totals.costs * 0.2, 2500)).toFixed(2));

  return {
    averageMargin,
    recommendedMonthlyFee,
    recommendedSetupFee,
  };
}
