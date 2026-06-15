import { randomUUID } from "node:crypto";
import { prisma } from "../prismaClient";

type JobRecord = {
  cashCollected: number;
  invoicedAmount: number;
  laborCost: number;
  materialCost: number;
};

let ensureHistoryTablePromise: Promise<void> | null = null;

async function ensureLeakageScoreHistoryTableExists(): Promise<void> {
  if (ensureHistoryTablePromise) return ensureHistoryTablePromise;

  ensureHistoryTablePromise = (async () => {
    try {
      // Repo has no prisma/migrations directory, so production-grade runtime can’t rely on a migration being applied.
      // Create the table once, best-effort.
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public."LeakageScoreHistory" (
          "id" text PRIMARY KEY,
          "companyId" text NOT NULL,
          "score" double precision NOT NULL,
          "signal" text NOT NULL,
          "totalLeakage" double precision NOT NULL,
          "uncollectedRevenue" double precision NOT NULL,
          "underpricedServices" double precision NOT NULL,
          "laborInefficiency" double precision NOT NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "LeakageScoreHistory_companyId_idx"
          ON public."LeakageScoreHistory" ("companyId");
        CREATE INDEX IF NOT EXISTS "LeakageScoreHistory_createdAt_idx"
          ON public."LeakageScoreHistory" ("createdAt");
      `);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[leakageScoreEngine] Failed to ensure LeakageScoreHistory table exists; will compute-only and attempt insert anyway. Error:",
        msg
      );
    }
  })();

  return ensureHistoryTablePromise;
}

export async function calculateLeakageScore(companyId: string): Promise<{
  score: number;
  signal: string;
  totalLeakage: number;
  breakdown: {
    uncollectedRevenue: number;
    underpricedServices: number;
    laborInefficiency: number;
  };
}> {
  const jobs = (await prisma.job.findMany({
    where: { companyId },
  })) as JobRecord[];

  const uncollectedRevenue = jobs
    .filter((job: JobRecord) => job.cashCollected < job.invoicedAmount)
    .reduce((sum: number, job: JobRecord) => sum + (job.invoicedAmount - job.cashCollected), 0);

  const underpricedServices = jobs.reduce((sum: number, job: JobRecord) => {
    const profit = job.cashCollected - job.laborCost - job.materialCost;
    const margin = job.cashCollected === 0 ? 0 : profit / job.cashCollected;

    if (margin >= 0.3) {
      return sum;
    }

    const targetProfit = job.cashCollected * 0.3;
    return sum + (targetProfit - profit);
  }, 0);

  const laborInefficiency = jobs.reduce((sum: number, job: JobRecord) => {
    const profit = job.cashCollected - job.laborCost - job.materialCost;
    return profit < 0 ? sum + Math.abs(profit) : sum;
  }, 0);

  const totalLeakage = uncollectedRevenue + underpricedServices + laborInefficiency;
  const totalRevenue = jobs.reduce((sum: number, job: JobRecord) => sum + job.invoicedAmount, 0);

  const score = totalRevenue === 0 ? 0 : Number(((totalLeakage / totalRevenue) * 100).toFixed(2));

  let signal = "CLEAN";
  if (score > 40) signal = "CRITICAL";
  else if (score > 25) signal = "HIGH";
  else if (score > 15) signal = "MODERATE";

  await ensureLeakageScoreHistoryTableExists();

  try {
    await prisma.leakageScoreHistory.create({
      data: {
        id: randomUUID(),
        companyId,
        score,
        signal,
        totalLeakage,
        uncollectedRevenue,
        underpricedServices,
        laborInefficiency,
      },
    });
  } catch (err: unknown) {
    // Best-effort. Keep the UI stable even if DB permissions/extensions differ.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist in the current database") && msg.includes("LeakageScoreHistory")) {
      console.warn("[leakageScoreEngine] LeakageScoreHistory still missing after DDL; skipping insert.");
    } else {
      console.warn("[leakageScoreEngine] Failed to write LeakageScoreHistory; skipping insert. Error:", msg);
    }
  }

  return {
    score,
    signal,
    totalLeakage,
    breakdown: {
      uncollectedRevenue,
      underpricedServices,
      laborInefficiency,
    },
  };
}
