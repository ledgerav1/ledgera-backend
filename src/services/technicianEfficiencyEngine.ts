import { prisma } from "../prismaClient";

type JobRow = {
  id: string;
  technicianId: string | null;
  startedAt: Date | null;
  completedAt: Date;
  cashCollected: number;
  laborCost: number;
  materialCost: number;
};

type TechnicianEfficiency = {
  technicianId: string;
  technicianName: string | null;

  jobsCount: number;

  revenue: number;
  profit: number;
  marginPct: number;

  revenuePerJob: number;
  profitPerJob: number;

  avgJobDurationHours: number;

  efficiencyScore: number;
};

function durationHours(startedAt: Date | null, completedAt: Date): number {
  if (!startedAt) return 0;
  const ms = completedAt.getTime() - startedAt.getTime();
  const hours = ms / (1000 * 60 * 60);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return hours;
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Technician efficiency model (MVP / deterministic):
 * - marginPct drives quality (profit / revenue)
 * - speed drives throughput (inverse of avg job duration)
 * - scale drives ownership (jobsCount / windowJobs cap)
 *
 * Returns a score 0..100. Callback rate isn't available yet in persisted tables,
 * so we keep it out (you can upgrade this later when ServiceTitan callbacks are normalized).
 */
export async function technicianEfficiency(
  companyId: string,
  windowDays: number = 30
): Promise<{
  windowDays: number;
  technicians: TechnicianEfficiency[];
}> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const jobs = (await prisma.job.findMany({
    where: {
      companyId,
      technicianId: { not: null },
      completedAt: { gte: since },
    },
    select: {
      id: true,
      technicianId: true,
      startedAt: true,
      completedAt: true,
      cashCollected: true,
      laborCost: true,
      materialCost: true,
    },
  })) as unknown as JobRow[];

  const buckets = new Map<string, TechnicianEfficiency>();

  for (const job of jobs) {
    if (!job.technicianId) continue;

    const profit = job.cashCollected - job.laborCost - job.materialCost;
    const bucket =
      buckets.get(job.technicianId) ??
      ({
        technicianId: job.technicianId,
        technicianName: null,

        jobsCount: 0,
        revenue: 0,
        profit: 0,
        marginPct: 0,

        revenuePerJob: 0,
        profitPerJob: 0,

        avgJobDurationHours: 0,
        efficiencyScore: 0,
      } as TechnicianEfficiency);

    bucket.jobsCount += 1;
    bucket.revenue += job.cashCollected;
    bucket.profit += profit;
    bucket.avgJobDurationHours += durationHours(job.startedAt, job.completedAt);

    buckets.set(job.technicianId, bucket);
  }

  const technicians = Array.from(buckets.values());

  // compute aggregates
  for (const tech of technicians) {
    tech.avgJobDurationHours =
      tech.jobsCount > 0 ? tech.avgJobDurationHours / tech.jobsCount : 0;

    tech.marginPct = tech.revenue > 0 ? (tech.profit / tech.revenue) * 100 : 0;
    tech.revenuePerJob = tech.jobsCount > 0 ? tech.revenue / tech.jobsCount : 0;
    tech.profitPerJob = tech.jobsCount > 0 ? tech.profit / tech.jobsCount : 0;

    // normalize terms into 0..1, then score.
    // margin: cap at 40% as "excellent"
    const marginScore = clamp01(tech.marginPct / 40);

    // speed: assume 8 hours/job is "slow"; 2 hours/job is "fast"
    const speedScore = (() => {
      const d = tech.avgJobDurationHours;
      if (d <= 2) return 1;
      if (d >= 8) return 0;
      return clamp01((8 - d) / (8 - 2));
    })();

    // scale: relative to max jobs in window
    const maxJobs = Math.max(...technicians.map((t) => t.jobsCount), 1);
    const scaleScore = tech.jobsCount / maxJobs;

    const efficiencyScore = (marginScore * 0.5 + speedScore * 0.3 + scaleScore * 0.2) * 100;
    tech.efficiencyScore = Number(efficiencyScore.toFixed(2));
    tech.marginPct = Number(tech.marginPct.toFixed(2));
    tech.revenuePerJob = clampNonNegative(Number(tech.revenuePerJob.toFixed(2)));
    tech.profitPerJob = clampNonNegative(Number(tech.profitPerJob.toFixed(2)));
    tech.avgJobDurationHours = Number(tech.avgJobDurationHours.toFixed(2));
  }

  // enrich technicianName
  const technicianIds = technicians.map((t) => t.technicianId);
  const technicianRows = await prisma.technician.findMany({
    where: { companyId, id: { in: technicianIds } },
    select: { id: true, name: true },
  });

  const nameById = new Map<string, string>();
  for (const t of technicianRows) nameById.set(t.id, t.name);

  for (const tech of technicians) {
    tech.technicianName = nameById.get(tech.technicianId) ?? null;
  }

  return {
    windowDays,
    technicians: technicians.sort((a, b) => b.efficiencyScore - a.efficiencyScore),
  };
}
