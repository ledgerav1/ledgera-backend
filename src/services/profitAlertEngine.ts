import { calculateDispatchInefficiency } from "./dispatchInefficiencyEngine";
import { marginAnalysis } from "./marginEngine";
import { calculatePricingInconsistency } from "./pricingInconsistencyEngine";
import { technicianEfficiency } from "./technicianEfficiencyEngine";

export type ProfitAlertSeverity = "CLEAN" | "HIGH" | "CRITICAL";

export type ProfitAlertType =
  | "LOW_JOB_MARGIN"
  | "LOW_SERVICE_MARGIN"
  | "PRICING_INCONSISTENCY"
  | "LOW_TECHNICIAN_EFFICIENCY"
  | "IDLE_TECHNICIAN";

export type ProfitAlert = {
  type: ProfitAlertType;
  severity: ProfitAlertSeverity;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
  estimatedLostDollars?: number;
};

function filterNotNull<T>(v: T | null): v is T {
  return v !== null;
}

function toPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number((value * 100).toFixed(2));
}

function jobMarginPct(cashCollected: number, laborCost: number, materialCost: number): number {
  if (cashCollected <= 0) return 0;
  const profit = cashCollected - laborCost - materialCost;
  return toPct(profit / cashCollected);
}

export async function profitAlertEngine(
  companyId: string,
  windowDays: number = 30
): Promise<{
  windowDays: number;
  generatedAt: string;
  alerts: ProfitAlert[];
}> {
  const lowJobMarginPct = Number.parseFloat(process.env.LOW_JOB_MARGIN_PCT ?? "30");
  const lowServiceMarginPct = Number.parseFloat(process.env.LOW_SERVICE_MARGIN_PCT ?? "30");
  const lowTechnicianEfficiencyScore = Number.parseFloat(
    process.env.LOW_TECHNICIAN_EFFICIENCY_SCORE ?? "60"
  );

  const jobSeverity = (marginPct: number): ProfitAlertSeverity => {
    if (marginPct < Math.max(0, lowJobMarginPct * 0.5)) return "CRITICAL";
    if (marginPct < Math.max(0, lowJobMarginPct)) return "HIGH";
    return "CLEAN";
  };

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Job-level low margin alerts
  const { prisma } = await import("../prismaClient");
  const jobs = await prisma.job.findMany({
    where: {
      companyId,
      completedAt: { gte: since },
      cashCollected: { gt: 0 },
    },
    select: {
      id: true,
      cashCollected: true,
      laborCost: true,
      materialCost: true,
      technicianId: true,
      serviceType: { select: { name: true } },
    },
  });

  const jobAlerts = jobs
    .map((job) => {
      const marginPct = jobMarginPct(job.cashCollected, job.laborCost, job.materialCost);
      const severity = jobSeverity(marginPct);
      if (severity === "CLEAN") return null;

      const serviceName = job.serviceType?.name ?? "Unknown service";
      const technicianId = job.technicianId ?? "unassigned";

      const profit = job.cashCollected - job.laborCost - job.materialCost;
      const targetProfit = job.cashCollected * (lowJobMarginPct / 100);
      const estimatedLostDollars = Math.max(targetProfit - profit, 0);

      const alert: ProfitAlert = {
        type: "LOW_JOB_MARGIN",
        severity,
        title: `Low job margin: ${marginPct.toFixed(2)}%`,
        detail: `Job ${job.id} for ${serviceName}. Technician=${technicianId}. Threshold=${lowJobMarginPct}%`,
        estimatedLostDollars,
        data: {
          jobId: job.id,
          serviceType: serviceName,
          technicianId,
          marginPct,
          cashCollected: job.cashCollected,
          laborCost: job.laborCost,
          materialCost: job.materialCost,
          estimatedLostDollars,
        },
      };

      return alert;
    })
    .filter(filterNotNull);

  // Service-level margin insights (converted into alerts)
  const serviceMargins = await marginAnalysis(companyId);
  const serviceAlerts = Object.entries(serviceMargins)
    .map(([serviceName, bucket]) => {
      const marginPct = Math.max(0, bucket.margin) * 100;

      const severity: ProfitAlertSeverity =
        marginPct < Math.max(0, lowServiceMarginPct * 0.5)
          ? "CRITICAL"
          : marginPct < Math.max(0, lowServiceMarginPct)
            ? "HIGH"
            : "CLEAN";

      if (severity === "CLEAN") return null;

      const alert: ProfitAlert = {
        type: "LOW_SERVICE_MARGIN",
        severity,
        title: `Service margin low: ${marginPct.toFixed(2)}%`,
        detail: `Service=${serviceName}. Revenue=${bucket.revenue.toFixed(
          2
        )}. Profit=${bucket.profit.toFixed(2)}.`,
        data: {
          serviceType: serviceName,
          marginPct,
          revenue: bucket.revenue,
          profit: bucket.profit,
        },
      };

      return alert;
    })
    .filter(filterNotNull);

  // Pricing inconsistency (signal already classified)
  const pricing = await calculatePricingInconsistency(companyId);
  const pricingAlerts = pricing.serviceTypeRanges
    .filter((r) => r.signal !== "CLEAN")
    .slice(0, 10)
    .map((r) => {
      const severity: ProfitAlertSeverity = r.signal;

      const alert: ProfitAlert = {
        type: "PRICING_INCONSISTENCY",
        severity,
        title: `Pricing inconsistency: ${r.serviceTypeName}`,
        detail: `Spread=${r.spreadPct}% (q10=${r.q10.toFixed(2)}, q90=${r.q90.toFixed(
          2
        )}), Jobs=${r.jobCount}`,
        data: r,
      };

      return alert;
    });

  // Technician efficiency (signal from score)
  const techEff = await technicianEfficiency(companyId, windowDays);
  const techAlerts = techEff.technicians
    .filter((t) => t.efficiencyScore < lowTechnicianEfficiencyScore)
    .slice(0, 10)
    .map((t) => {
      const severity: ProfitAlertSeverity =
        t.efficiencyScore < lowTechnicianEfficiencyScore * 0.6 ? "CRITICAL" : "HIGH";

      const alert: ProfitAlert = {
        type: "LOW_TECHNICIAN_EFFICIENCY",
        severity,
        title: `Low technician efficiency: ${t.technicianName ?? t.technicianId}`,
        detail: `EfficiencyScore=${t.efficiencyScore}, Profit=${t.profit.toFixed(
          2
        )}, Margin=${t.marginPct.toFixed(2)}%`,
        data: t,
      };

      return alert;
    });

  // Dispatch inefficiency / idle technician time proxy
  const dispatch = await calculateDispatchInefficiency(companyId, windowDays);
  const idleAlerts = dispatch.technicians
    .filter((t) => t.signal !== "CLEAN")
    .slice(0, 10)
    .map((t) => {
      const severity: ProfitAlertSeverity = t.signal;

      const alert: ProfitAlert = {
        type: "IDLE_TECHNICIAN",
        severity,
        title: `Idle technician time`,
        detail: `Technician=${t.technicianName ?? t.technicianId}. IdleHours=${t.idleHoursInWindow.toFixed(
          2
        )} (threshold=${process.env.DISPATCH_IDLE_GAP_HOURS_THRESHOLD ?? "2"}h gaps).`,
        data: t,
      };

      return alert;
    });

  const alerts = [...jobAlerts, ...serviceAlerts, ...pricingAlerts, ...techAlerts, ...idleAlerts]
    .filter((a) => a.severity !== "CLEAN")
    .sort((a, b) => {
      const rank = (s: ProfitAlertSeverity) => (s === "CRITICAL" ? 3 : s === "HIGH" ? 2 : 1);
      return rank(b.severity) - rank(a.severity);
    })
    .slice(0, 50);

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    alerts,
  };
}
