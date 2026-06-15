import { prisma } from "../prismaClient";
import { profitAlertEngine } from "./profitAlertEngine";

type MoneyAgg = { _sum: { cashCollected: number | null; laborCost: number | null; materialCost: number | null } };

function formatPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number((value * 100).toFixed(2));
}

export async function computeDashboardMetrics(
  companyId: string,
  windowDays: number = 30
): Promise<{
  windowDays: number;
  totalRevenue: number;
  totalProfit: number;
  avgMarginPct: number;
  moneyLeakedThisWeek: number;
}> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const agg = await prisma.job.aggregate({
    where: { companyId, completedAt: { gte: since } },
    _sum: { cashCollected: true, laborCost: true, materialCost: true },
  }) as MoneyAgg;

  const cashCollected = agg._sum.cashCollected ?? 0;
  const laborCost = agg._sum.laborCost ?? 0;
  const materialCost = agg._sum.materialCost ?? 0;

  const totalRevenue = cashCollected;
  const totalProfit = cashCollected - laborCost - materialCost;
  const avgMarginPct = totalRevenue === 0 ? 0 : Number(((totalProfit / totalRevenue) * 100).toFixed(2));

  const leakWindowDays = 7;
  const alerts = await profitAlertEngine(companyId, leakWindowDays);

  const moneyLeakedThisWeek = alerts.alerts.reduce((sum, a) => {
    const v = typeof a.estimatedLostDollars === "number" ? a.estimatedLostDollars : 0;
    if (!Number.isFinite(v)) return sum;
    return sum + v;
  }, 0);

  return {
    windowDays,
    totalRevenue,
    totalProfit,
    avgMarginPct,
    moneyLeakedThisWeek,
  };
}
