import { prisma } from "../prismaClient";

const IDLE_GAP_HOURS_THRESHOLD = parseFloat(
  process.env.DISPATCH_IDLE_GAP_HOURS_THRESHOLD ?? "2"
);

const DEFAULT_WINDOW_DAYS = parseInt(process.env.DISPATCH_WINDOW_DAYS ?? "30", 10);

type JobRow = {
  id: string;
  technicianId: string | null;
  startedAt: Date | null;
  completedAt: Date;
  laborCost: number;
};

type TechnicianDispatch = {
  technicianId: string;
  technicianName: string | null;

  idleGapsCount: number;
  idleHoursInWindow: number;

  estimatedLostLaborCostInWindow: number;
  estimatedLostLaborCostWeekly: number;

  signal: "CLEAN" | "HIGH" | "CRITICAL";
};

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function safeDurationHours(startedAt: Date | null, completedAt: Date): number {
  if (!startedAt) return 0;
  const ms = completedAt.getTime() - startedAt.getTime();
  const hours = ms / (1000 * 60 * 60);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return hours;
}

export async function calculateDispatchInefficiency(
  companyId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS
): Promise<{
  windowDays: number;
  totalIdleHours: number;
  totalEstimatedLostLaborCostInWindow: number;
  totalEstimatedLostLaborCostWeekly: number;
  technicians: TechnicianDispatch[];
}> {
  const jobs = (await prisma.job.findMany({
    where: {
      companyId,
      technicianId: { not: null },
      startedAt: { not: null },
      // completedAt is required in the schema, so we don't filter it with { not: null }.
    },
    select: {
      id: true,
      technicianId: true,
      startedAt: true,
      completedAt: true,
      laborCost: true,
    },
    orderBy: [{ technicianId: "asc" }, { startedAt: "asc" }],
  })) as unknown as JobRow[];

  const jobsByTechnician = new Map<
    string,
    { rows: JobRow[]; laborCostPerHourSamples: number[] }
  >();

  for (const job of jobs) {
    if (!job.technicianId) continue;

    const bucket =
      jobsByTechnician.get(job.technicianId) ??
      ({
        rows: [],
        laborCostPerHourSamples: [],
      } as { rows: JobRow[]; laborCostPerHourSamples: number[] });

    bucket.rows.push(job);

    const durationHours = safeDurationHours(job.startedAt, job.completedAt);
    if (durationHours > 0) {
      bucket.laborCostPerHourSamples.push(
        clampNonNegative(job.laborCost) / durationHours
      );
    }

    jobsByTechnician.set(job.technicianId, bucket);
  }

  const technicians: TechnicianDispatch[] = [];

  for (const [technicianId, bucket] of jobsByTechnician.entries()) {
    const rows = bucket.rows.slice().sort((a, b) => {
      const aT = a.startedAt ? a.startedAt.getTime() : 0;
      const bT = b.startedAt ? b.startedAt.getTime() : 0;
      return aT - bT;
    });

    if (rows.length < 2) {
      technicians.push({
        technicianId,
        technicianName: null,
        idleGapsCount: 0,
        idleHoursInWindow: 0,
        estimatedLostLaborCostInWindow: 0,
        estimatedLostLaborCostWeekly: 0,
        signal: "CLEAN",
      });
      continue;
    }

    const avgLaborCostPerHour = (() => {
      if (bucket.laborCostPerHourSamples.length === 0) return 0;
      const sum = bucket.laborCostPerHourSamples.reduce((s, n) => s + n, 0);
      return sum / bucket.laborCostPerHourSamples.length;
    })();

    let idleGapsCount = 0;
    let idleHoursInWindow = 0;

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];

      const prevCompleted = prev.completedAt;
      const currStarted = curr.startedAt;

      if (!currStarted) continue;

      const gapHours = (currStarted.getTime() - prevCompleted.getTime()) / (1000 * 60 * 60);
      if (!Number.isFinite(gapHours)) continue;

      if (gapHours >= IDLE_GAP_HOURS_THRESHOLD) {
        idleGapsCount += 1;
        idleHoursInWindow += gapHours;
      }
    }

    const estimatedLostLaborCostInWindow = clampNonNegative(
      idleHoursInWindow * avgLaborCostPerHour
    );

    // Scale to weekly view.
    const scale = windowDays > 0 ? 7 / windowDays : 1;
    const estimatedLostLaborCostWeekly = estimatedLostLaborCostInWindow * scale;

    let signal: "CLEAN" | "HIGH" | "CRITICAL" = "CLEAN";
    if (idleHoursInWindow >= 16) signal = "CRITICAL";
    else if (idleHoursInWindow >= 8) signal = "HIGH";

    technicians.push({
      technicianId,
      technicianName: null,
      idleGapsCount,
      idleHoursInWindow,
      estimatedLostLaborCostInWindow,
      estimatedLostLaborCostWeekly,
      signal,
    });
  }

  // Optional: enrich technicianName with a single query.
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

  const totalIdleHours = technicians.reduce((s, t) => s + t.idleHoursInWindow, 0);
  const totalEstimatedLostLaborCostInWindow = technicians.reduce(
    (s, t) => s + t.estimatedLostLaborCostInWindow,
    0
  );
  const totalEstimatedLostLaborCostWeekly = technicians.reduce(
    (s, t) => s + t.estimatedLostLaborCostWeekly,
    0
  );

  return {
    windowDays,
    totalIdleHours,
    totalEstimatedLostLaborCostInWindow,
    totalEstimatedLostLaborCostWeekly,
    technicians,
  };
}
