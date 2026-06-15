import { prisma } from "../prismaClient";

export type CallMetrics = {
  windowDays: number;
  attributedCallCount: number;
  leadsAttributedCount: number;
  convertedJobsCount: number;
  conversionRate: number; // 0..1

  missedCallsAttributedCount: number;
  connectedCallsAttributedCount: number; // answered/completed

  // Decision-engine enhancement: convert missed calls into an estimated revenue impact.
  // MVP model (deterministic):
  // missedRevenueEstimate = missedCalls * conversionRate * avgRevenuePerConvertedJob * missedCallConversionMultiplier
  missedRevenueEstimate: number;
  avgRevenuePerConvertedJob: number;
};

function daysAgoDate(days: number): Date {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

function isFiniteNumber(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n;
}

function uniqStrings(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) set.add(v);
  }
  return Array.from(set);
}

export async function getCallMetrics(
  companyId: string,
  windowDays: number = 30
): Promise<CallMetrics> {
  const since = daysAgoDate(windowDays);

  const [attributedCallCount, leadsAttributedCount, convertedJobsCount, missedCallsAttributedCount, connectedCallsAttributedCount] =
    await Promise.all([
      prisma.callAttribution.count({
        where: {
          companyId,
          attributedAt: { gte: since },
        },
      }),

      prisma.callAttribution.count({
        where: {
          companyId,
          attributedAt: { gte: since },
          demoLeadId: { not: null },
        },
      }),

      prisma.callAttribution.count({
        where: {
          companyId,
          attributedAt: { gte: since },
          jobId: { not: null },
        },
      }),

      prisma.callAttribution.count({
        where: {
          companyId,
          attributedAt: { gte: since },
          callEvent: {
            status: "missed",
          },
        },
      }),

      prisma.callAttribution.count({
        where: {
          companyId,
          attributedAt: { gte: since },
          callEvent: {
            status: { in: ["answered", "completed"] },
          },
        },
      }),
    ]);

  const leads = leadsAttributedCount;
  const conversionRate = leads > 0 ? convertedJobsCount / leads : 0;

  // Estimate missed-call revenue impact using inferred average job revenue.
  const missedCallConversionMultiplier = parseFloat(
    process.env.MISSED_CALL_CONVERSION_MULTIPLIER ?? "0.5"
  );

  const convertedAttributions = await prisma.callAttribution.findMany({
    where: {
      companyId,
      attributedAt: { gte: since },
      jobId: { not: null },
    },
    select: { jobId: true },
    distinct: ["jobId" as any] as any,
  });

  const convertedJobIds = uniqStrings(convertedAttributions.map((a) => a.jobId as any));

  const convertedJobsAgg =
    convertedJobIds.length > 0
      ? await prisma.job.aggregate({
          where: { companyId, id: { in: convertedJobIds } },
          _sum: { invoicedAmount: true, cashCollected: true },
        })
      : { _sum: { invoicedAmount: 0, cashCollected: 0 } };

  // Prefer cashCollected (actually realized) if present, else fallback to invoicedAmount.
  const sumCash = convertedJobsAgg._sum.cashCollected ?? 0;
  const sumInv = convertedJobsAgg._sum.invoicedAmount ?? 0;
  const sumRevenue = sumCash > 0 ? sumCash : sumInv;

  const avgRevenuePerConvertedJob =
    convertedJobIds.length > 0 ? sumRevenue / convertedJobIds.length : 0;

  const missedRevenueEstimate =
    missedCallsAttributedCount *
    conversionRate *
    avgRevenuePerConvertedJob *
    (Number.isFinite(missedCallConversionMultiplier) ? missedCallConversionMultiplier : 0.5);

  return {
    windowDays,
    attributedCallCount,
    leadsAttributedCount,
    convertedJobsCount,
    conversionRate: isFiniteNumber(conversionRate),
    missedCallsAttributedCount,
    connectedCallsAttributedCount,

    missedRevenueEstimate: isFiniteNumber(missedRevenueEstimate),
    avgRevenuePerConvertedJob: isFiniteNumber(avgRevenuePerConvertedJob),
  };
}
