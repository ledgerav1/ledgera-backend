import { prisma } from "../prismaClient";

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);

  if (lower === upper) return sorted[lower];

  const weight = pos - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

type JobRow = {
  serviceTypeId: string | null;
  invoicedAmount: number;
  serviceType: { name: string } | null;
};

export async function calculatePricingInconsistency(
  companyId: string
): Promise<{
  serviceTypeRanges: Array<{
    serviceTypeId: string;
    serviceTypeName: string;
    minPrice: number;
    maxPrice: number;
    q10: number;
    q90: number;
    jobCount: number;
    median: number;
    spreadPct: number;
    signal: "CLEAN" | "HIGH" | "CRITICAL";
  }>;
  overall: {
    distinctServiceTypes: number;
    jobsAnalyzed: number;
    criticalCount: number;
    highCount: number;
  };
}> {
  const jobs = (await prisma.job.findMany({
    where: {
      companyId,
      serviceTypeId: { not: null },
      invoicedAmount: { gt: 0 },
    },
    select: {
      serviceTypeId: true,
      invoicedAmount: true,
      serviceType: { select: { name: true } },
    },
  })) as unknown as JobRow[];

  const buckets = new Map<
    string,
    {
      serviceTypeName: string;
      prices: number[];
    }
  >();

  for (const job of jobs) {
    if (!job.serviceTypeId) continue;

    const key = job.serviceTypeId;
    const existing =
      buckets.get(key) ?? { serviceTypeName: job.serviceType?.name ?? "Unknown", prices: [] };

    existing.prices.push(job.invoicedAmount);
    buckets.set(key, existing);
  }

  const serviceTypeRanges: Array<{
    serviceTypeId: string;
    serviceTypeName: string;
    minPrice: number;
    maxPrice: number;
    q10: number;
    q90: number;
    jobCount: number;
    median: number;
    spreadPct: number;
    signal: "CLEAN" | "HIGH" | "CRITICAL";
  }> = [];

  for (const [serviceTypeId, bucket] of buckets.entries()) {
    const prices = bucket.prices.slice().sort((a, b) => a - b);
    const jobCount = prices.length;

    const minPrice = prices[0] ?? 0;
    const maxPrice = prices[prices.length - 1] ?? 0;

    const q10 = quantile(prices, 0.1);
    const q90 = quantile(prices, 0.9);
    const median = quantile(prices, 0.5);

    const spreadBase = median > 0 ? median : (q10 > 0 ? q10 : 0);
    const spreadPct =
      spreadBase > 0 ? (q90 - q10) / spreadBase : maxPrice > 0 ? 1 : 0;

    const spreadPctClamped = clampNonNegative(spreadPct) * 100;

    // Spec-inspired signals: wide spread implies inconsistency.
    let signal: "CLEAN" | "HIGH" | "CRITICAL" = "CLEAN";
    if (spreadPctClamped >= 45) signal = "CRITICAL";
    else if (spreadPctClamped >= 25) signal = "HIGH";

    serviceTypeRanges.push({
      serviceTypeId,
      serviceTypeName: bucket.serviceTypeName,
      minPrice: clampNonNegative(minPrice),
      maxPrice: clampNonNegative(maxPrice),
      q10: clampNonNegative(q10),
      q90: clampNonNegative(q90),
      jobCount,
      median: clampNonNegative(median),
      spreadPct: Number(spreadPctClamped.toFixed(2)),
      signal,
    });
  }

  const criticalCount = serviceTypeRanges.filter((r) => r.signal === "CRITICAL").length;
  const highCount = serviceTypeRanges.filter((r) => r.signal === "HIGH").length;
  const jobsAnalyzed = serviceTypeRanges.reduce((sum, r) => sum + r.jobCount, 0);

  return {
    serviceTypeRanges: serviceTypeRanges.sort((a, b) => {
      if (b.signal !== a.signal) {
        const rank = (s: string) => (s === "CRITICAL" ? 3 : s === "HIGH" ? 2 : 1);
        return rank(b.signal) - rank(a.signal);
      }
      return b.spreadPct - a.spreadPct;
    }),
    overall: {
      distinctServiceTypes: serviceTypeRanges.length,
      jobsAnalyzed,
      criticalCount,
      highCount,
    },
  };
}
