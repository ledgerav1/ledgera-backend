import { prisma } from "../prismaClient";

type PartsRow = {
  jobExternalId: string;
  partName: string;
  partExternalId: string | null;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
};

type PartsLeakageResult = {
  score: number;
  signal: string;
  jobsWithParts: number;
  distinctParts: number;
  partsPerJob: number;
  totalQuantity: number;
  totalCost: number;
  topParts: Array<{
    partExternalId: string | null;
    partName: string;
    quantity: number;
    totalCost: number;
  }>;
};

function toNumberOrZero(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function deriveSignal(score: number): string {
  if (score >= 40) return "CRITICAL";
  if (score >= 25) return "HIGH";
  if (score >= 15) return "MODERATE";
  return "CLEAN";
}

export async function calculatePartsLeakageScore(companyId: string): Promise<PartsLeakageResult> {
  const rows = (await prisma.serviceTitanJobPartUsage.findMany({
    where: { companyId },
    select: {
      jobExternalId: true,
      partName: true,
      partExternalId: true,
      quantity: true,
      unitCost: true,
      totalCost: true,
    },
  })) as unknown as PartsRow[];

  if (rows.length === 0) {
    return {
      score: 0,
      signal: "CLEAN",
      jobsWithParts: 0,
      distinctParts: 0,
      partsPerJob: 0,
      totalQuantity: 0,
      totalCost: 0,
      topParts: [],
    };
  }

  const jobIds = new Set<string>();
  const partIds = new Set<string>();

  const perPart = new Map<
    string,
    { partExternalId: string | null; partName: string; quantity: number; totalCost: number }
  >();

  let totalQuantity = 0;
  let totalCost = 0;

  for (const row of rows) {
    jobIds.add(row.jobExternalId);

    const partKey = row.partExternalId ?? row.partName;
    partIds.add(partKey);

    totalQuantity += row.quantity;
    totalCost += toNumberOrZero(row.totalCost);

    const existing =
      perPart.get(partKey) ??
      ({
        partExternalId: row.partExternalId,
        partName: row.partName,
        quantity: 0,
        totalCost: 0,
      } as const);

    perPart.set(partKey, {
      ...existing,
      partExternalId: row.partExternalId,
      partName: row.partName,
      quantity: (existing as { quantity: number }).quantity + row.quantity,
      totalCost: (existing as { totalCost: number }).totalCost + toNumberOrZero(row.totalCost),
    });
  }

  const jobsWithParts = jobIds.size;
  const distinctParts = partIds.size;
  const partsPerJob = distinctParts / Math.max(1, jobsWithParts);

  const partTotals = Array.from(perPart.values());
  partTotals.sort((a, b) => b.totalCost - a.totalCost);

  const topPartCost = partTotals[0]?.totalCost ?? 0;
  const topPartCostShare = totalCost > 0 ? topPartCost / totalCost : 0;

  // Proxy leakage model:
  // - High parts-per-job suggests part substitutions / wrong parts used / over-ordering behavior.
  // - Low top-part share suggests high diversity (more likely wrong-part usage / unnecessary SKUs).
  const partsPerJobClamped = clamp01(partsPerJob / 5); // 0..5 parts/job maps to 0..1
  const diversityPenalty = clamp01(1 - topPartCostShare); // 0 when concentrated, 1 when spread out
  const raw = partsPerJobClamped * 60 + diversityPenalty * 40;

  const score = Number(raw.toFixed(2));
  const signal = deriveSignal(score);

  return {
    score,
    signal,
    jobsWithParts,
    distinctParts,
    partsPerJob: Number(partsPerJob.toFixed(2)),
    totalQuantity,
    totalCost: Number(totalCost.toFixed(2)),
    topParts: partTotals.slice(0, 5).map((p) => ({
      partExternalId: p.partExternalId,
      partName: p.partName,
      quantity: p.quantity,
      totalCost: Number(p.totalCost.toFixed(2)),
    })),
  };
}
